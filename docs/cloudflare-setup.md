# Cài Cloudflare cho tên miền NexusZone (gói Free)

Mục tiêu: tên miền đi qua Cloudflare để chặn tấn công (DDoS, bot, spam) **trước khi** tới server.
Ví dụ dùng tên miền `nexuszone.vn`; thay bằng tên miền thật của bạn.

Sơ đồ sau khi cài:

```
Người dùng ──> nexuszone.vn        (Vercel: web)       DNS only  – Vercel tự chống DDoS
           └─> api.nexuszone.vn    (Render: API)       Proxied   – đi qua Cloudflare (WAF, rate limit)
Email (Resend): bản ghi MX / TXT                         DNS only  – không bao giờ proxy
```

> Vì sao web để *DNS only*? Vercel khuyên **không** đặt proxy của Cloudflare trước Vercel (lỗi chứng chỉ,
> mất cache của Vercel) và Vercel đã có chống DDoS sẵn. Phần cần che chắn nhất là **API** — nơi có đăng
> nhập, dữ liệu và database.

---

## Bước 0 — Chuẩn bị (10 phút)

1. Đăng nhập được trang quản lý tên miền ở nơi bạn mua (Mắt Bão, PA Việt Nam, Tenten, iNET, Nhân Hòa…).
2. **Chụp lại toàn bộ bản ghi DNS hiện tại** (trang *Quản lý DNS* của nhà cung cấp). Bước 2 cần so lại.
3. Nếu tên miền đang bật **DNSSEC** ở nhà cung cấp: **tắt DNSSEC trước** (bật lại ở Bước 9). Để nguyên sẽ làm tên miền không truy cập được khi đổi nameserver.
4. Tạo tài khoản tại <https://dash.cloudflare.com/sign-up> và bật xác thực 2 lớp (My Profile → Authentication).

## Bước 1 — Thêm tên miền vào Cloudflare

1. Cloudflare Dashboard → **Add a domain** (hoặc *Add site*).
2. Nhập `nexuszone.vn` → chọn *Quick scan for DNS records* → **Continue**.
3. Chọn gói **Free** → **Continue**.

## Bước 2 — Kiểm tra bản ghi DNS Cloudflare vừa quét

Cloudflare tự chép các bản ghi cũ; **so với ảnh chụp ở Bước 0**, thiếu cái nào thì *Add record* thêm vào. Đặt cột **Proxy status** như sau:

| Bản ghi | Ví dụ | Proxy status |
|---|---|---|
| Web gốc (Vercel) | `A  @  76.76.21.21` | **DNS only** (đám mây xám) |
| `www` (Vercel) | `CNAME  www  cname.vercel-dns.com` | **DNS only** |
| API (Render) — thêm ở Bước 5 | `CNAME  api  <tên-service>.onrender.com` | DNS only lúc đầu → **Proxied** sau |
| Email Resend | `MX send …`, `TXT send "v=spf1 …"`, `TXT resend._domainkey …`, `TXT _dmarc …` | **DNS only** (bản ghi MX / TXT luôn xám) |
| Bản ghi khác (Google, Zalo xác minh…) | giữ nguyên | DNS only |

Giá trị đúng của bản ghi Vercel xem ở **Vercel → Project → Settings → Domains** (Vercel ghi rõ A / CNAME cần đặt).

## Bước 3 — Đổi nameserver ở nơi mua tên miền

1. Cloudflare hiện **2 nameserver**, dạng `ava.ns.cloudflare.com` và `bob.ns.cloudflare.com` (mỗi tài khoản khác nhau — chép đúng 2 cái của bạn).
2. Vào trang quản lý tên miền → *Thay đổi DNS / Nameserver* → chọn **dùng nameserver riêng** → xoá nameserver cũ, nhập 2 nameserver Cloudflare → Lưu.
   - Tên miền **.vn**: một số nhà cung cấp phải gửi yêu cầu lên VNNIC, có thể mất vài giờ; nếu không tự đổi được thì nhắn hỗ trợ của nhà cung cấp kèm 2 nameserver.
3. Quay lại Cloudflare → **Check nameservers now**. Khi xong, Cloudflare gửi email *"… is now active on Cloudflare"* (thường 5 phút – 24 giờ).
4. Trong lúc chờ web vẫn chạy bình thường (DNS cũ và mới giống nhau).

## Bước 4 — SSL / HTTPS

Cloudflare → tên miền → **SSL/TLS**:

1. **Overview** → chọn **Full (strict)**. (Không chọn *Flexible* — dễ gây vòng lặp chuyển hướng và không mã hoá tới server.)
2. **Edge Certificates**:
   - **Always Use HTTPS**: On
   - **Minimum TLS Version**: TLS 1.2
   - **Automatic HTTPS Rewrites**: On
   - **HSTS**: không cần bật ở đây (web và API đã tự gửi HSTS).

## Bước 5 — Đưa API (Render) về `api.nexuszone.vn`

1. **Render** → service backend → **Settings → Custom Domains → Add Custom Domain** → nhập `api.nexuszone.vn`. Render hiện bản ghi cần thêm (CNAME tới `<tên-service>.onrender.com`).
2. **Cloudflare → DNS → Add record**: Type `CNAME`, Name `api`, Target `<tên-service>.onrender.com`, Proxy status **DNS only** (xám) → Save.
3. Quay lại Render, bấm **Verify**; chờ Render báo *Verified* và *Certificate issued* (vài phút).
4. Về Cloudflare, sửa bản ghi `api` → bật **Proxied** (đám mây cam) → Save.
5. **Render → Environment**, thêm / sửa rồi *Save* (Render tự deploy lại):
   - `TRUST_CLOUDFLARE=true` — API lấy đúng IP người dùng từ Cloudflare (không có biến này, mọi người dùng bị tính chung một IP của Cloudflare → giới hạn số lần bị chạm rất nhanh).
   - `CORS_ORIGIN=https://nexuszone.vn,https://www.nexuszone.vn`
   - `PUBLIC_WEB_URL=https://nexuszone.vn`
6. **Vercel → Settings → Environment Variables**: `NEXT_PUBLIC_API_URL=https://api.nexuszone.vn` → **Redeploy** (biến `NEXT_PUBLIC_*` chỉ có hiệu lực sau khi build lại).
7. Kiểm tra: mở `https://api.nexuszone.vn/health` thấy `{"ok":true}`; đăng nhập web bình thường. Trong DevTools → Network, response của API có header `server: cloudflare` và `cf-ray`.

## Bước 5b — Chỉ cho phép đi qua Cloudflare (chặn gọi thẳng `*.onrender.com`)

Render cũng đặt máy chủ sau Cloudflare, nên không phân biệt được bằng địa chỉ IP. Cách làm: Cloudflare gắn một **header bí mật** vào mọi request tới `api.`; request nào thiếu header đó (gọi thẳng Render) bị chặn.

1. Tạo chuỗi bí mật dài, ngẫu nhiên (vd vào <https://www.random.org/strings/> lấy 1 chuỗi 32 ký tự chữ + số, hoặc chạy `openssl rand -hex 32`). **Không** gửi chuỗi này cho ai, không dán vào chat.
2. **Cloudflare → tên miền → Rules → Transform Rules** (hoặc *Rules → Overview → Create rule → Request Header Transform Rule*) → **Modify Request Header → Create rule**:
   - Rule name: `Khoá API qua Cloudflare`
   - *If incoming requests match*: **Custom filter expression** → `(http.host eq "api.nexuszone.vn")`
   - *Then*: **Set static** — Header name `X-Origin-Auth`, Value = chuỗi bí mật ở bước 1
   - **Deploy**.
3. **Render → Environment**: thêm `ORIGIN_SECRET` = **đúng** chuỗi bí mật đó → Save (chờ deploy xong).
4. Kiểm tra:
   - `https://nexuszone.vn` đăng nhập bình thường.
   - `https://<service>.onrender.com/api/public/maintenance` → `{"error":"Forbidden.","code":"direct_access"}`.
   - `https://<service>.onrender.com/health` → `{"ok":true}`.
   - Web lỗi → xoá `ORIGIN_SECRET` trên Render (web chạy lại ngay), kiểm tra Transform Rule đúng tên miền / đúng giá trị.

Đổi chuỗi bí mật: sửa ở Cloudflare **và** Render cùng lúc (Cloudflare trước, Render ngay sau).

> `CLOUDFLARE_ONLY` (bản trước) đã bỏ: nó dựa vào địa chỉ IP nên không dùng được trên Render.

## Bước 6 — Bảo mật cơ bản

Cloudflare → tên miền → **Security**:

1. **Settings** (hoặc *Security → Settings*): **Security Level** = Medium; **Browser Integrity Check** = On.
2. **Bots** → **Bot Fight Mode** = On.
3. **Không** bật *Under Attack Mode* và *Security Level: I'm Under Attack* cho API: chế độ này bắt mọi request giải thử thách JavaScript, mà API trả JSON nên web sẽ **không gọi được API** (đăng nhập, tải dữ liệu đều lỗi). Khi bị tấn công, dùng Bước 7–8.

## Bước 7 — Luật giới hạn tốc độ (WAF → Rate limiting rules)

Gói Free có **1 luật**, đếm trong 10 giây, chặn 10 giây (gói trả phí đặt được lâu hơn).

Security → **WAF → Rate limiting rules → Create rule**:

- Rule name: `Chặn dò mật khẩu`
- *If incoming requests match*: **Custom filter expression** → *Edit expression*:
  ```
  (http.host eq "api.nexuszone.vn" and starts_with(http.request.uri.path, "/api/public/auth/"))
  ```
- *With the same characteristics*: IP
- *When rate exceeds*: **20** requests / **10 seconds**
- *Then take action*: **Block**, *for duration*: 10 seconds
- **Deploy**.

(API vẫn có giới hạn riêng: 30 lần đăng nhập / 10 phút / IP, 10 lần / 10 phút / tài khoản.)

## Bước 8 — Luật chặn tuỳ chỉnh (WAF → Custom rules, gói Free 5 luật)

Dùng khi thấy tấn công (Cloudflare → **Security → Events** cho biết IP / quốc gia / đường dẫn đang bị dội):

- **Chặn một IP / dải IP**: expression `(ip.src in {203.0.113.7 198.51.100.0/24})` → Action **Block**.
- **Chặn quốc gia không có người dùng** (chỉ khi đang bị tấn công từ đó): `(ip.src.country in {"XX" "YY"} and http.host eq "api.nexuszone.vn")` → Block.
  Không chặn VN và các nước người dùng hay đi du lịch.
- Không dùng action *Managed Challenge* / *JS Challenge* cho `api.` — lý do như Bước 6.3.

Ngoài ra vẫn có thể chặn nhanh ở server bằng biến `BLOCKED_IPS` trên Render (xem README §12).

## Bước 9 — Hoàn tất

1. **DNSSEC**: Cloudflare → **DNS → Settings → DNSSEC → Enable** → chép bản ghi DS Cloudflare đưa vào trang quản lý tên miền (nếu nhà cung cấp hỗ trợ; .vn có thể phải nhờ hỗ trợ).
2. **Turnstile (chống bot ở đăng nhập)**: Cloudflare → **Turnstile → Add widget** → Widget name `NexusZone`, Hostname `nexuszone.vn` và `www.nexuszone.vn`, Widget mode **Managed** → Create → chép:
   - *Site key* → Vercel `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (Redeploy)
   - *Secret key* → Render `TURNSTILE_SECRET_KEY`
3. **Theo dõi**: UptimeRobot (miễn phí) → New monitor → HTTP(s) → `https://api.nexuszone.vn/health` mỗi 5 phút → nhận email khi API chết.
4. **Supabase → Authentication → URL Configuration**: Site URL `https://nexuszone.vn`, Redirect URLs `https://nexuszone.vn/**` (và `https://www.nexuszone.vn/**`).

## Kiểm tra cuối

| Kiểm tra | Kết quả đúng |
|---|---|
| `https://nexuszone.vn` | Web mở bình thường, có ổ khoá HTTPS |
| `https://api.nexuszone.vn/health` | `{"ok":true}`, header `server: cloudflare` |
| Gọi thẳng `https://<service>.onrender.com/api/public/maintenance` (khi đã bật `ORIGIN_SECRET`) | `403 direct_access` |
| Đăng nhập, đăng ký, gửi email mã | Hoạt động; email vẫn tới (bản ghi Resend còn đủ, DNS only) |
| Render → Logs | IP trong log là IP người dùng, không phải IP Cloudflare |

## Sự cố thường gặp

| Hiện tượng | Cách sửa |
|---|---|
| `ERR_TOO_MANY_REDIRECTS` | SSL/TLS đang ở *Flexible* → đổi sang **Full (strict)** |
| Render không cấp chứng chỉ cho `api.` | Để bản ghi `api` **DNS only** tới khi Render báo *Certificate issued*, rồi mới bật Proxied |
| Web báo lỗi kết nối API / CORS sau khi đổi | `NEXT_PUBLIC_API_URL` trên Vercel chưa đổi hoặc chưa Redeploy; `CORS_ORIGIN` trên Render thiếu tên miền mới |
| Mọi người bị "Too many requests" | Thiếu `TRUST_CLOUDFLARE=true` trên Render |
| Không nhận được email mã | Bản ghi MX / TXT của Resend bị thiếu hoặc bị bật Proxied → thêm lại, để DNS only; kiểm tra Resend → Domains còn *Verified* |
| Web không vào được sau khi đổi nameserver | Chờ đủ 24 giờ; kiểm tra bản ghi Vercel đúng như Vercel → Domains yêu cầu; DNSSEC cũ đã tắt chưa |
