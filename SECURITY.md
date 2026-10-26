# Bảo mật — Pickleball Manager

Tài liệu này mô tả cách hệ thống được bảo vệ, những việc **bắt buộc phải làm khi deploy**, và cách báo lỗ hổng.

## 1. Kiến trúc & ranh giới tin cậy

```
Trình duyệt ──HTTPS──> Web (Vercel, Next.js)        chỉ giữ anon key của Supabase (để đăng nhập)
     │
     └────HTTPS──> API (Render, Express) ──service-role key──> Supabase (Postgres + Auth)
```

- **Mọi dữ liệu đều đi qua API.** Trình duyệt không bao giờ đọc/ghi database trực tiếp.
- API kiểm tra phiên đăng nhập (JWT của Supabase) ở mỗi request và kiểm tra **quyền sở hữu** (CLB, thành viên, kèo, giải…) trước khi đọc/ghi. Truy cập dữ liệu của Host khác trả về 404.
- `SUPABASE_SERVICE_ROLE_KEY` **chỉ** nằm trên Render. Không bao giờ đặt nó vào Vercel hay biến `NEXT_PUBLIC_*`.

## 2. Các lớp bảo vệ đã có

| Lớp | Bảo vệ |
|---|---|
| Database | Row-Level Security bật trên mọi bảng. Migration `20261112090000_security_lockdown.sql`: các view chạy với quyền người gọi (`security_invoker`), và role `anon` / `authenticated` **không có quyền** gì trên schema `public` → anon key công khai không đọc được dữ liệu (kể cả qua view). |
| Đăng nhập | Supabase Auth (JWT). API từ chối token sai/hết hạn (401). Web tự làm mới phiên, nếu vẫn bị từ chối thì đăng xuất cục bộ. Mật khẩu đăng ký tối thiểu 8 ký tự. |
| Phân quyền | Guard sở hữu cho `:clubId`, `:memberId`, `:eventId`, `:participantId`, `:tournamentId`…; co-admin chỉ được thành viên + tài chính của CLB được cấp; nhân sự chỉ thấy kèo được giao. |
| HTTP (API) | Header bảo mật (nosniff, chống nhúng iframe, CSP `default-src 'none'`, HSTS, no-referrer), `Cache-Control: no-store` cho mọi `/api`, ẩn `X-Powered-By`, mã `X-Request-Id`. |
| CORS | Chỉ cho phép web của bạn (`CORS_ORIGIN`). Web khác không gọi được API từ trình duyệt. Ở production, **thiếu `CORS_ORIGIN` (hoặc đặt `*`) thì API không khởi động** — tránh vô tình mở API cho mọi trang web. |
| Chống spam / brute-force | Rate limit theo IP: toàn API 600/phút; trang công khai 120/phút; đăng ký kèo, gửi ảnh chuyển khoản, xác nhận thành viên, quét QR, chuyển slot, tham gia CLB 30/phút; góp ý & gửi thử thông báo 10 / 10 phút. Vượt ngưỡng → 429. |
| Đầu vào | Body JSON tối đa 1 MB; ảnh chỉ nhận JPEG/PNG/WebP dạng data URL có giới hạn kích thước (không nhận SVG); mọi id kiểm tra định dạng UUID; chỉ nhận các trường cho phép (chống mass-assignment); ký tự `%`/`_` được escape khi so khớp. |
| SSRF | Webhook của Host phải là **https công khai**: chặn localhost, IP nội bộ, metadata cloud (169.254.169.254), URL chứa user/password; kiểm tra lại DNS ngay trước khi gửi và không đi theo redirect. |
| Lộ thông tin | Ở production, lỗi database nội bộ chỉ trả "Database error" + `request_id` (chi tiết nằm trong log server). Lỗi dữ liệu do người dùng nhập (ràng buộc, giá trị sai) vẫn hiển thị để sửa. |
| Web (Next.js) | Content-Security-Policy (chỉ script của chính web, chỉ kết nối tới API + Supabase, chỉ nhúng Google Maps (xem trước địa điểm), không cho trang khác nhúng web, cấm plugin), HSTS, `Referrer-Policy` không gửi link chứa token sang web khác, `Permissions-Policy` chỉ cho camera (quét QR), tắt Image Optimizer không dùng tới. |
| Thư viện | Next.js 15.5.27 + React 19 (đã vá các lỗ hổng critical của Next 14). `npm audit` backend: 0 lỗ hổng. Web: còn cảnh báo `xlsx` (bản npm 0.18.x, chưa có bản vá trên npm) — `xlsx` giờ **chỉ dùng để xuất** Excel; file người dùng tải lên (Nhập thành viên) được đọc bằng `read-excel-file`, nên lỗ hổng khi đọc file độc hại không áp dụng. |
| Tài khoản | **Xác thực 2 lớp** (mã TOTP 6 số, kiểm tra ở server, gắn với từng phiên đăng nhập Supabase), bắt buộc cho Owner / nhân viên hỗ trợ và hỏi lại mỗi 12 giờ ở Trang Owner; khoá bí mật mã hoá AES-256-GCM, mã khôi phục lưu băm, mỗi mã dùng một lần, tối đa 10 lần thử / 10 phút. **Email báo đăng nhập từ thiết bị mới.** **Đăng xuất khỏi mọi thiết bị** (API từ chối token phát hành trước thời điểm đó). Trang Owner tự đăng xuất sau 30 phút không thao tác. |
| Dữ liệu cá nhân | Chính sách bảo mật (`/privacy`) + Điều khoản (`/terms`), đồng ý khi đăng ký và khi đổi phiên bản (lưu `terms_version`, `terms_accepted_at`). Người dùng tự tải dữ liệu (JSON, không chứa bí mật) và tự xoá tài khoản. Ảnh chuyển khoản tự xoá sau `PROOF_RETENTION_DAYS` (90) ngày, thiết bị đăng nhập sau 1 năm. |
| Chống bot (v2) | **Cloudflare Turnstile** ở đăng nhập / đăng ký / quên mật khẩu (bật khi đặt `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; thường không hiện gì, chỉ hỏi khi nghi là bot). Cloudflare không trả lời thì vẫn cho qua (không khoá người thật), các giới hạn số lần vẫn áp dụng. |
| Mật khẩu (v2) | Đăng ký: từ chối mật khẩu đã lộ trong các vụ rò rỉ (Have I Been Pwned, k-anonymity: chỉ 5 ký tự đầu của mã SHA-1 rời server), mật khẩu phổ biến, hoặc chứa tên đăng nhập / email. Sai mật khẩu bị giới hạn 30 lần / 10 phút / IP và 10 lần / 10 phút / tài khoản. |
| Chống sập (v2) | Ngắt kết nối gửi chậm (slowloris: header 20 s, cả request 30 s); khi quá tải (event loop trễ > 1 s) trả nhanh `503 overloaded` + `Retry-After` thay vì treo cả server; bộ đếm rate limit giới hạn 100 000 khoá (một cuộc tấn công từ nhiều IP không làm tràn bộ nhớ); `BLOCKED_IPS` chặn ngay IP / dải IP; lỗi bất ngờ trong tác vụ nền chỉ ghi log, lỗi nghiêm trọng thì tiến trình tự khởi động lại (Render). |
| Database (v2) | Migration `20261220090000_function_search_path.sql`: cố định `search_path` cho các hàm trigger (cảnh báo *Function Search Path Mutable* của Supabase). Các bảng "RLS bật nhưng không có policy" là **cố ý**: không ai đọc trực tiếp được, chỉ backend (service role). |
| Thư viện (v2, 26/10/2026) | Next.js **15.5.28** (vá RCE qua Image Optimizer + DoS Server Actions), `body-parser` bản vá DoS, `uuid` ≥ 11.1.1 (qua `overrides`). `npm audit` backend + web: **0 lỗ hổng**. |
| Secret | `.env*` bị git bỏ qua; đã quét repo + lịch sử git: không có key nào bị commit. |

## 3. Checklist khi deploy (bắt buộc)

1. **Chạy migration** `supabase/migrations/20261112090000_security_lockdown.sql` trong Supabase SQL Editor (hoặc `supabase db push`).
2. **Render (backend) → Environment:**
   - `NODE_ENV=production` (ẩn lỗi nội bộ).
   - `CORS_ORIGIN=https://<web-của-bạn>.vercel.app` (nhiều domain thì ngăn bằng dấu phẩy).
   - `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`: chỉ đặt ở đây.
   - **Không** đặt `ALLOW_INSECURE_WEBHOOKS` hay `RATE_LIMIT_DISABLED` (chỉ dùng cho test).
3. **Vercel (web):** chỉ `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Supabase → Authentication:**
   - URL Configuration: Site URL = web của bạn; Redirect URLs chỉ gồm domain của bạn.
   - Providers → Email: bật *Confirm email*; *Minimum password length* = 8; bật *Leaked password protection* nếu gói cho phép.
   - Rate Limits: giữ mặc định hoặc chặt hơn.
5. **Đổi key đã từng lộ** (ví dụ Resend API key từng dán vào chat): tạo key mới, xoá key cũ.
6. Bật **2FA** cho tài khoản GitHub, Supabase, Render, Vercel.
7. **Xác thực 2 lớp trong app:** đặt `MFA_ENC_KEY` trên Render (`openssl rand -hex 32`, giữ cố định, không đổi). Chạy migration `20261113090000_account_security.sql`. Sau khi deploy, mỗi email trong `OWNER_EMAILS` và mỗi nhân viên hỗ trợ vào **Hồ sơ → Bảo mật** bật xác thực 2 lớp (Trang Owner sẽ yêu cầu), cất **mã khôi phục** ở nơi an toàn.

8. **Tên miền riêng (mới):**
   - Thêm tên miền vào `CORS_ORIGIN` (Render), vd `CORS_ORIGIN=https://nexuszone.vn,https://www.nexuszone.vn` — chỉ các địa chỉ này gọi được API.
   - Supabase → Authentication → URL Configuration: *Site URL* = `https://nexuszone.vn`, *Redirect URLs* chỉ gồm tên miền của bạn.
   - Supabase → Authentication → Providers → Email: bật **Leaked password protection** (nếu gói Pro), *Minimum password length* = 8.
9. **Cloudflare Turnstile (chống bot):** Cloudflare → Turnstile → *Add widget* (tên miền của bạn, chế độ *Managed*) → đặt `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Vercel) và `TURNSTILE_SECRET_KEY` (Render) → deploy lại cả hai.

## 4. Kiểm thử bảo mật

Bộ test tự động (chạy với backend ở chế độ production) kiểm tra: header bảo mật, CORS, token giả, body quá lớn / JSON hỏng, SSRF webhook, ẩn lỗi DB, **anon key không đọc được bảng & view**, và rate limit (429).

## 6. Chống DDoS / làm sập web (hạ tầng)

Code chỉ chống được tấn công nhỏ (một vài IP, gửi chậm, spam form). Tấn công lớn (hàng nghìn IP) phải chặn **trước khi tới server**:

1. **Đưa tên miền qua Cloudflare** (gói Free đủ dùng) — hướng dẫn từng bước: **[docs/cloudflare-setup.md](docs/cloudflare-setup.md)**. Tóm tắt: web (Vercel) để *DNS only*, API ở `api.<tên-miền>` để *Proxied*, bản ghi email luôn *DNS only*; SSL **Full (strict)**; Bot Fight Mode; 1 luật rate limit cho `/api/public/auth/*`; trên Render đặt `TRUST_CLOUDFLARE=true`, và dùng Transform Rule của Cloudflare gắn header bí mật `X-Origin-Auth` + biến `ORIGIN_SECRET` trên Render để chặn ai gọi thẳng `*.onrender.com` (bước 5b).
   - **Không bật *Under Attack Mode* cho API**: nó bắt giải thử thách JavaScript nên web không gọi được API. Khi bị tấn công dùng luật chặn IP / quốc gia (WAF → Custom rules) hoặc `BLOCKED_IPS`.
2. **Vercel** đã có chống DDoS sẵn; khi cần bật thêm *Firewall → Attack Challenge Mode* (chỉ ảnh hưởng trang web, không ảnh hưởng API).
3. Sau khi API chạy qua `api.<tên-miền>`: đổi `NEXT_PUBLIC_API_URL` trên Vercel và Redeploy.
4. **Sao lưu dữ liệu**: Supabase → Database → Backups (gói Pro: sao lưu hằng ngày + PITR). Gói Free: định kỳ tải bản sao (`supabase db dump`) cất ở nơi riêng.
5. **Theo dõi**: đặt một dịch vụ báo khi web chết (vd UptimeRobot, gọi `https://api.<tên-miền>/health` mỗi 5 phút) để biết ngay khi có sự cố.

## 5. Báo lỗ hổng

Gửi qua nút **Góp ý** trong app (ghi "SECURITY") hoặc email cho chủ dự án. Vui lòng không công khai lỗ hổng trước khi được sửa.

## Xử lý sự cố lộ lọt dữ liệu cá nhân

Áp dụng khi nghi ngờ hoặc phát hiện dữ liệu cá nhân bị truy cập, sao chép, sửa hoặc xoá trái phép (ví dụ lộ `SUPABASE_SERVICE_ROLE_KEY`, tài khoản Owner bị chiếm, lỗi phân quyền để người này xem được dữ liệu người khác).

1. **Khoanh vùng ngay (trong vài giờ):**
   - Lộ khoá: tạo khoá mới trên Supabase / Resend / Render, cập nhật biến môi trường, deploy lại; khoá cũ vô hiệu. Đổi `MFA_ENC_KEY` chỉ khi chính khoá này bị lộ (mọi người sẽ phải bật lại 2 lớp).
   - Tài khoản bị chiếm: Owner **đình chỉ** tài khoản đó ở Trang Owner; người dùng bấm **Đăng xuất khỏi mọi thiết bị**, đổi mật khẩu, bật 2 lớp.
   - Lỗi trong code: tắt tính năng liên quan hoặc deploy bản sửa; nếu cần, bật thông báo chung (Trang Owner → Thông báo) báo bảo trì.
2. **Ghi lại** (trong một tài liệu riêng, không đưa lên repo): thời điểm phát hiện, cách phát hiện, dữ liệu nào / của bao nhiêu người, khoảng thời gian bị lộ, đã làm gì. Nguồn đối chiếu: log Render, log Supabase, Nhật ký Owner, nhật ký thao tác CLB, bảng `login_devices`.
3. **Thông báo cơ quan có thẩm quyền** về bảo vệ dữ liệu cá nhân (Bộ Công an — A05) **trong 72 giờ** kể từ khi phát hiện, theo mẫu và kênh quy định hiện hành (Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân — nhờ luật sư xác nhận yêu cầu đang áp dụng).
4. **Thông báo người bị ảnh hưởng** (email qua Resend + thông báo chung trong app): chuyện gì xảy ra, dữ liệu nào bị ảnh hưởng, app đã làm gì, họ nên làm gì (đổi mật khẩu, bật 2 lớp, cảnh giác tin nhắn giả danh CLB đòi chuyển tiền).
5. **Sau sự cố:** tìm nguyên nhân gốc, thêm test để lỗi không lặp lại, cập nhật tài liệu này.

