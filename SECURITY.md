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
| Database | Row-Level Security bật trên mọi bảng. Migration `20261008090000_security_lockdown.sql`: các view chạy với quyền người gọi (`security_invoker`), và role `anon` / `authenticated` **không có quyền** gì trên schema `public` → anon key công khai không đọc được dữ liệu (kể cả qua view). |
| Đăng nhập | Supabase Auth (JWT). API từ chối token sai/hết hạn (401). Web tự làm mới phiên, nếu vẫn bị từ chối thì đăng xuất cục bộ. Mật khẩu đăng ký tối thiểu 8 ký tự. |
| Phân quyền | Guard sở hữu cho `:clubId`, `:memberId`, `:eventId`, `:participantId`, `:tournamentId`…; co-admin chỉ được thành viên + tài chính của CLB được cấp; nhân sự chỉ thấy kèo được giao. |
| HTTP (API) | Header bảo mật (nosniff, chống nhúng iframe, CSP `default-src 'none'`, HSTS, no-referrer), `Cache-Control: no-store` cho mọi `/api`, ẩn `X-Powered-By`, mã `X-Request-Id`. |
| CORS | Chỉ cho phép web của bạn (`CORS_ORIGIN`). Web khác không gọi được API từ trình duyệt. |
| Chống spam / brute-force | Rate limit theo IP: toàn API 600/phút; trang công khai 120/phút; đăng ký kèo, gửi ảnh chuyển khoản, xác nhận thành viên, quét QR, chuyển slot, tham gia CLB 30/phút; góp ý & gửi thử thông báo 10 / 10 phút. Vượt ngưỡng → 429. |
| Đầu vào | Body JSON tối đa 1 MB; ảnh chỉ nhận JPEG/PNG/WebP dạng data URL có giới hạn kích thước (không nhận SVG); mọi id kiểm tra định dạng UUID; chỉ nhận các trường cho phép (chống mass-assignment); ký tự `%`/`_` được escape khi so khớp. |
| SSRF | Webhook của Host phải là **https công khai**: chặn localhost, IP nội bộ, metadata cloud (169.254.169.254), URL chứa user/password; kiểm tra lại DNS ngay trước khi gửi và không đi theo redirect. |
| Lộ thông tin | Ở production, lỗi database nội bộ chỉ trả "Database error" + `request_id` (chi tiết nằm trong log server). Lỗi dữ liệu do người dùng nhập (ràng buộc, giá trị sai) vẫn hiển thị để sửa. |
| Webhook Telegram | Chỉ nhận request có đúng `X-Telegram-Bot-Api-Secret-Token` (so sánh constant-time). |
| Web (Next.js) | Content-Security-Policy (chỉ script của chính web, chỉ kết nối tới API + Supabase, cấm nhúng iframe, cấm plugin), HSTS, `Referrer-Policy` không gửi link chứa token sang web khác, `Permissions-Policy` chỉ cho camera (quét QR), tắt Image Optimizer không dùng tới. |
| Thư viện | Next.js 15.5.27 + React 19 (đã vá các lỗ hổng critical của Next 14). `npm audit` backend: 0 lỗ hổng. Web: còn cảnh báo `xlsx` — app **chỉ xuất** Excel, không đọc file người dùng tải lên nên không bị ảnh hưởng. |
| Secret | `.env*` bị git bỏ qua; đã quét repo + lịch sử git: không có key nào bị commit. |

## 3. Checklist khi deploy (bắt buộc)

1. **Chạy migration** `supabase/migrations/20261008090000_security_lockdown.sql` trong Supabase SQL Editor (hoặc `supabase db push`).
2. **Render (backend) → Environment:**
   - `NODE_ENV=production` (ẩn lỗi nội bộ).
   - `CORS_ORIGIN=https://<web-của-bạn>.vercel.app` (nhiều domain thì ngăn bằng dấu phẩy).
   - `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `TELEGRAM_*`: chỉ đặt ở đây.
   - **Không** đặt `ALLOW_INSECURE_WEBHOOKS` hay `RATE_LIMIT_DISABLED` (chỉ dùng cho test).
3. **Vercel (web):** chỉ `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Supabase → Authentication:**
   - URL Configuration: Site URL = web của bạn; Redirect URLs chỉ gồm domain của bạn.
   - Providers → Email: bật *Confirm email*; *Minimum password length* = 8; bật *Leaked password protection* nếu gói cho phép.
   - Rate Limits: giữ mặc định hoặc chặt hơn.
5. **Đổi key đã từng lộ** (ví dụ Resend API key từng dán vào chat): tạo key mới, xoá key cũ.
6. Bật **2FA** cho tài khoản GitHub, Supabase, Render, Vercel.

## 4. Kiểm thử bảo mật

Bộ test tự động (chạy với backend ở chế độ production) kiểm tra: header bảo mật, CORS, token giả, body quá lớn / JSON hỏng, SSRF webhook, secret Telegram, ẩn lỗi DB, **anon key không đọc được bảng & view**, và rate limit (429).

## 5. Báo lỗ hổng

Gửi qua nút **Góp ý** trong app (ghi "SECURITY") hoặc email cho chủ dự án. Vui lòng không công khai lỗ hổng trước khi được sửa.
