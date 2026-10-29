# Coach Manager — kế hoạch chi tiết

Sản phẩm **tách hẳn** khỏi Quản lý CLB / Social Manager: không thuộc gói nào, không bị khoá khi gói CLB hết hạn, có không gian, menu, quyền và dữ liệu riêng. Dùng chung tài khoản, hồ sơ người chơi, thông báo, email và giao diện của web.

## 1. Mục tiêu và phạm vi

**Coach Manager** giúp một huấn luyện viên (coach) quản lý việc dạy của mình:

- Hồ sơ coach công khai (giới thiệu, trình độ, sân dạy, giá, lịch rảnh) để người chơi tìm và đăng ký.
- Lớp học / buổi tập: lớp nhóm theo lịch lặp, buổi kèm 1-1, buổi lẻ. Giới hạn chỗ, danh sách chờ.
- Học viên: ai đang học, gói buổi còn bao nhiêu, điểm danh, ghi chú tiến bộ.
- Thu tiền: gói buổi (ví dụ 8 buổi / 1 tháng), chuyển khoản VietQR + chứng từ, coach xác nhận; sổ thu chi riêng của coach.
- Học viên xem lịch học, đăng ký, huỷ, xem còn mấy buổi, nhận thông báo.

**Giai đoạn 1 (ra bản dùng được)**: hồ sơ coach · lớp / buổi · đăng ký · điểm danh · gói buổi + thanh toán · sổ thu chi · phần học viên.
**Giai đoạn 2**: lịch rảnh và đặt 1-1 theo khung giờ · ghi chú tiến bộ, video · đánh giá coach · trang tìm coach (`/discover` thêm tab Coach).
**Giai đoạn 3 (tuỳ chọn)**: trợ giảng (quyền phụ), liên kết với CLB (coach dạy tại sân của CLB, học viên là thành viên), thống kê.

**Không làm**: giải đấu (sản phẩm riêng sau), gói / tier, Owner duyệt từng coach (chỉ cần tài khoản đã xác nhận email; Owner vẫn có nút khoá nếu bị báo cáo).

## 2. Vai trò

| Vai trò | Là ai | Được làm gì |
|---|---|---|
| **Coach** | Người dùng bất kỳ đã xác nhận email, bấm *Mở hồ sơ Coach* | Toàn quyền trên hồ sơ, lớp, học viên, tiền của mình |
| **Học viên** | Người dùng có hồ sơ người chơi (như hiện nay) | Xem, đăng ký, huỷ, nộp chứng từ, xem gói còn lại |
| **Trợ giảng** (giai đoạn 3) | Người coach mời | Điểm danh, xem danh sách; không thấy tiền |
| **Ban quản trị (Owner)** | OWNER_EMAILS | Xem danh sách coach, khoá / mở hồ sơ, xem báo cáo; không sửa dữ liệu coach |

Một người có thể vừa là Host CLB vừa là Coach vừa là học viên của coach khác. Quyền coach **không** đi qua `clubAccess`, `staff_grants` hay gói.

## 3. Luồng người dùng

### Coach
1. Trang chủ `/home` → ô **Coach** (nếu đã có hồ sơ) hoặc nút *Mở hồ sơ Coach* trong màn *Tạo CLB / Cộng đồng mới*.
2. Tạo hồ sơ: tên hiển thị, ảnh (dùng ảnh tài khoản), môn (pickleball / cầu lông), giới thiệu, DUPR / trình độ, khu vực, sân dạy (tên + link bản đồ), giá tham khảo, tài khoản nhận tiền (VietQR: dùng `users.bank_code / bank_account / bank_holder` đã có).
3. Tạo **gói buổi**: tên, số buổi, giá, hạn dùng (tháng). Ví dụ *Gói 8 buổi · 1.600.000 đ · 2 tháng*.
4. Tạo **lớp**: tên, loại (nhóm / 1-1 / lẻ), sân, giờ, ngày trong tuần + khoảng ngày (sinh ra các buổi như *Tạo lịch cố định* hiện nay), số chỗ, phí / buổi nếu không dùng gói, hạn đăng ký, cho phép danh sách chờ.
5. Mỗi buổi: danh sách học viên, **điểm danh** (có / vắng / báo nghỉ), trừ buổi của gói khi *có mặt*, ghi chú buổi.
6. **Thu tiền**: học viên chọn gói → chuyển khoản → nộp chứng từ → coach bấm *Đã nhận* → gói kích hoạt, ghi khoản thu. Phí buổi lẻ xử lý như phí kèo (đã thu / chưa thu / miễn phí).
7. **Sổ thu chi** riêng của coach (thu: gói, buổi lẻ; chi: thuê sân, bóng, khác), có ô tick *Không tính*.
8. Thông báo chuông + email: đăng ký mới, chứng từ mới, học viên huỷ, gói sắp hết.

### Học viên
1. Vào từ link coach gửi (`/coach/<slug>`), từ tab **Coach** trong mục *Tìm* (giai đoạn 2) hoặc từ tab **Lớp học** trong phần người chơi `/p`.
2. Xem hồ sơ, lịch lớp, giá. Bấm *Đăng ký* một lớp (hoặc một buổi lẻ) → chọn gói hoặc trả theo buổi → chuyển khoản theo VietQR → nộp chứng từ (như đăng ký kèo hiện nay).
3. Trang *Lớp học của tôi*: buổi sắp tới, còn N buổi trong gói, lịch sử điểm danh, nút *Tôi không đi được* (trước hạn huỷ do coach đặt).
4. QR check-in dùng lại mã của người chơi (coach quét bằng màn quét đã có).

## 4. Dữ liệu (Supabase, cùng project)

Tất cả bảng tiền tố `coach_`, chủ sở hữu là `user_id` của coach. `club_id` **không** có trong giai đoạn 1 (giai đoạn 3 thêm cột tuỳ chọn). Migration: `supabase/migrations/2026MMDD090000_coach_manager.sql`, chép vào `database/schema.sql`, thêm probe vào `backend/src/services/schemaCheck.js`.

```
coach_profiles        id, user_id (unique), slug (unique), display_name, sport, bio, level_text,
                      dupr_id, area, court_name, map_url, price_note, status (active|paused|blocked),
                      cancel_hours (hạn huỷ), deduct_mode (present_or_noshow|present_only|always),
                      public (bool, mặc định true), created_at, updated_at
coach_packages        id, coach_id → coach_profiles, name, sessions int, price int, valid_months int,
                      active bool, sort int
coach_classes         id, coach_id, title, kind (group|private|single), court_name, map_url,
                      start_time, duration_min, weekdays int[], date_from, date_to,
                      capacity int, fee int (phí buổi lẻ, 0 = chỉ dùng gói), signup_deadline_hours, deduct_mode (nullable, ghi đè),
                      waitlist bool, note, status (open|closed|archived)
coach_sessions        id, class_id, coach_id, session_date, start_time, duration_min, court_name,
                      status (scheduled|done|cancelled), note
coach_students        id, coach_id, user_id (nullable: đăng ký nhanh), full_name, phone (chỉ coach thấy; dùng để nối tài khoản),
                      level_text, note (riêng coach), first_seen, status (active|left|blocked)
                      unique (coach_id, user_id)
coach_enrollments     id, class_id, student_id, status (requested|confirmed|waitlist|cancelled|removed),
                      pay_mode (package|per_session|free), created_at
coach_attendance      id, session_id, student_id, status (present|absent|excused), checked_at,
                      by_user_id, package_purchase_id (gói bị trừ, nếu có)   unique (session_id, student_id)
coach_package_purchases
                      id, coach_id, student_id, package_id, sessions_total, sessions_used,
                      price, starts_on, expires_on, status (pending|active|expired|refunded),
                      refund_amount, refund_reason, refunded_at,
                      payment_proof (ảnh, giới hạn 400 KB như event_participants), paid_at,
                      transaction_id → transactions
coach_session_fees    id, session_id, student_id, amount, status (unpaid|paid|free),
                      payment_proof, paid_at, transaction_id   unique (session_id, student_id)
coach_notes           (giai đoạn 2) id, student_id, coach_id, session_id?, body, created_at
coach_reviews         (giai đoạn 2) id, coach_id, student_id, stars, body, created_at
```

**Sổ thu chi**: dùng lại bảng `transactions` với `owner_type = 'coach'` và cột mới `coach_id` (sửa `chk_txn_owner` cho phép owner thứ ba). Nhờ vậy `ledgerFilter`, ô tick *Không tính*, void + replace, Excel dùng lại nguyên.

**RLS / bảo mật**: giống đợt lockdown — mọi bảng `coach_*` bật RLS, `anon` / `authenticated` không đọc trực tiếp; mọi truy cập qua backend bằng service key. Hồ sơ công khai đọc qua API public có giới hạn tốc độ. Số điện thoại học viên chỉ coach thấy; trợ giảng không thấy; chứng từ chuyển khoản tự xoá sau 90 ngày như kèo (`proof_purged_at`).

**Views** (tuỳ chọn, tiện thống kê): `v_coach_student_balance` (gói còn bao nhiêu buổi), `v_coach_session_counts`.

## 5. API (Express, cùng app)

Mount: `app.use('/api/coach', requireAuth, coachRoutes)` và `app.use('/api/public/coach', publicCoachRoutes)`. Quyền: service mới `coachAccess.js` — `coachOf(req)` (hồ sơ của người đang đăng nhập), `assertCoachOwns(resource)`. Không gọi `assertFeature` / `requireFeature`.

### Coach
```
GET    /api/coach/me                       hồ sơ của tôi (404 nếu chưa có)
POST   /api/coach/me                       mở hồ sơ (cần email đã xác nhận; 1 hồ sơ / tài khoản)
PATCH  /api/coach/me                       sửa hồ sơ, status paused/active, public
GET    /api/coach/overview                 ô số: buổi tuần này, học viên đang học, chờ xác nhận, tiền tháng

GET/POST            /api/coach/packages
PATCH/DELETE        /api/coach/packages/:id        (xoá chỉ khi chưa ai mua, nếu không → active=false)

GET/POST            /api/coach/classes             (POST nhiều ngày → sinh sessions như lịch cố định)
GET/PATCH/DELETE    /api/coach/classes/:id         (PATCH {apply_to:'series'} chép sang buổi sắp tới)
GET                 /api/coach/sessions?from&to    lịch theo tuần / tháng
PATCH               /api/coach/sessions/:id        đổi giờ, sân, huỷ buổi (thông báo học viên)
GET                 /api/coach/sessions/:id/people học viên của buổi + trạng thái điểm danh + tiền
POST                /api/coach/sessions/:id/attendance  [{student_id, status}] (present → trừ gói / tạo fee)
POST                /api/coach/sessions/:id/scan   check-in bằng QR của người chơi (token hiện có)

GET                 /api/coach/students            danh sách + gói còn lại + nợ
GET/PATCH           /api/coach/students/:id        chi tiết, ghi chú, status
POST                /api/coach/students            thêm tay (tên + sđt, chưa có tài khoản → giống "---" của CLB, nối khi họ đăng ký)

GET                 /api/coach/enrollments?status=requested
PATCH               /api/coach/enrollments/:id     confirm / waitlist / remove
GET                 /api/coach/purchases?status=pending      chứng từ chờ xác nhận
PATCH               /api/coach/purchases/:id       {paid:true} → active + ghi transactions; {refund}
PATCH               /api/coach/fees/:id            đã thu / miễn phí

GET                 /api/coach/ledger              = transactions owner_type='coach' (dùng transactions.routes cho sửa / huỷ / không tính)
GET                 /api/coach/export.xlsx         học viên, điểm danh, thu chi (lib exportExcel hiện có)
```

### Học viên (trong `player.routes.js` hoặc file `coachStudent.routes.js`)
```
GET    /api/player/coach                   lớp của tôi: buổi sắp tới, gói còn lại, nợ
POST   /api/player/coach/classes/:id/enroll        {pay_mode, package_id?}
POST   /api/player/coach/enrollments/:id/cancel    tôn trọng cancel_hours
POST   /api/player/coach/purchases/:id/proof       nộp chứng từ (ảnh ≤ 400 KB)
POST   /api/player/coach/fees/:id/proof
```

### Public (không đăng nhập)
```
GET    /api/public/coach/:slug             hồ sơ + lớp đang mở (không có sđt, không có học viên)
POST   /api/public/coach/:slug/quick       đăng ký nhanh không tài khoản {name, phone, class_id|session_id, package_id?} → mã vé (Turnstile, rate limit như quick booking)
GET    /api/public/coach?sport&area&q      (giai đoạn 2) tìm coach
```

### Owner
```
GET    /api/owner/coaches                  danh sách, số học viên, trạng thái
PATCH  /api/owner/coaches/:id              block / unblock (ghi owner_audit_logs)
```

Thông báo: thêm `kind` mới vào `notify.js` (`coach_enroll`, `coach_proof`, `coach_cancel`, `coach_package_low`, `coach_session_changed`). Email dùng `emailTemplates.js`.

## 6. Giao diện (Next.js, cùng app)

### Không gian mới `coach`
- `WorkspaceContext`: thêm giá trị `'coach'`; `useScope()` trả `scoped=false` cho coach (các trang CLB không áp dụng).
- `AppShell`: menu riêng cho `coach` (không có khung gói, không có *Gói sử dụng*):
  - **Tổng quan** `/coach` — buổi hôm nay / tuần này, chờ xác nhận (đăng ký, chứng từ), ô số.
  - **Lịch dạy** `/coach/schedule` — tuần / tháng, bấm buổi → trang buổi.
  - **Lớp học** `/coach/classes`, `/coach/classes/new`, `/coach/classes/[id]` (tab Buổi · Học viên · Cài đặt).
  - **Buổi** `/coach/sessions/[id]` — điểm danh dạng thẻ (≥44px), quét QR, ghi chú.
  - **Học viên** `/coach/students`, `/coach/students/[id]` — gói còn lại, điểm danh, ghi chú, nợ.
  - **Tiền** `/coach/finance` (Tổng quan · Sổ thu chi · Gói buổi · Chờ xác nhận) — dùng lại `EventFinance`-style, `FinanceTrend`, ledger tab Chi tiết nhóm theo buổi.
  - **Hồ sơ Coach** `/coach/profile` — form + nút *Xem trang công khai* + *Chia sẻ link*.
  - **Tài khoản** `/account` (chỉ phần Thông tin / Bảo mật / Nhận tiền / Xoá tài khoản).
- Điện thoại: menu dưới 5 ô (Tổng quan · Lịch · Học viên · Tiền · Tài khoản), các hàng lọc là `ChipRow`, bảng nhiều cột thành danh sách 2 dòng, hướng dẫn (i) popup.

### Trang chủ và chuyển ngữ cảnh
- `/home`: ô **Coach** trong "Không gian của bạn" khi có `coach_profiles`; `ContextSwitcher` thêm mục Coach.
- `/clubs` (*Tạo CLB / Cộng đồng mới*): thêm lựa chọn **Mở hồ sơ Coach** (không cần duyệt, không thanh toán).

### Phần học viên
- `/p` thêm tab **Lớp học** (`/p/coach`): buổi sắp tới, gói còn lại, nộp chứng từ, *Tôi không đi được*.
- `/coach/[slug]` trang công khai (như `/discover/<id>` của CLB): hồ sơ, lịch lớp, nút *Đăng ký* (chưa đăng nhập → đăng nhập rồi quay lại).
- Vé buổi: dùng lại trang `/t/<code>` với QR của người chơi.

### Owner Console
- `/owner/coaches`: bảng + khoá / mở; ô số coach trên Tổng quan.

### i18n
Khối `coach.*` trong `web/lib/i18n/vi.js` và `en.js` (nhãn menu, form, trạng thái, thông báo). Copy: "Coach", "học viên", "buổi", "gói buổi"; không dùng "app" / "hệ thống" / "chúng tôi".

## 7. Dùng lại gì từ code hiện có

| Việc | Dùng lại |
|---|---|
| Sinh buổi theo thứ trong tuần + khoảng ngày | logic của *Tạo lịch cố định* (`events.routes` phần `dates` / `series_id`) tách thành hàm chung |
| Chuyển khoản VietQR + chứng từ + xác nhận | `payment.js`, giới hạn ảnh 400 KB, lịch xoá chứng từ (`privacy.js`) |
| QR check-in | token người chơi + endpoint scan (`attendance.js`) |
| Sổ thu chi, sửa / huỷ / không tính, Excel | `transactions.routes`, `ledgerFilter`, `exportExcel`, trang ledger |
| Thông báo chuông, email | `notify.js`, `emailTemplates.js` |
| Ảnh đại diện, hồ sơ người chơi, DUPR | `playerAvatars`, `users`, `dupr.js` |
| Giao diện | `AppShell`, `ActionRow`, `SectionTabs`, `UnderlineTabs`, `ChipRow`, `Segmented`, `Modal`, `Hint`, `UiIcon`, `rank-table` |
| Khoá / báo cáo | `owner.routes`, `owner_audit_logs`, `moderation.js` |

## 8. Thứ tự làm (mỗi đợt một PR, có test + ảnh 1440 / 390 + README)

| Đợt | Nội dung | Ước lượng |
|---|---|---|
| C1 ✅ (29/10) | Migration `20261230090000_coach_manager.sql` + probe + `coachAccess` + hồ sơ coach (API, `/coach/profile`, `/coach/[slug]`), không gian `coach` trong shell / home / chuyển ngữ cảnh, thẻ thứ ba ở màn chọn, công tắc `coach_enabled` + `COACH_BETA_EMAILS`, CORS cho preview Vercel | xong |
| C2 ✅ (29/10) | Migration `20261231090000_coach_classes.sql`, `coachSchedule` (sinh buổi theo thứ, tối đa 200), API gói / lớp / buổi, trang Gói buổi, Lớp học, Tạo lớp, trang lớp (Buổi · Cài đặt, áp dụng cho buổi sắp tới), Lịch dạy theo tuần, trang buổi, trang công khai hiện gói + lớp | xong |
| C3 ✅ (29/10) | Migration `20270101090000_coach_students.sql`, `coachStudents` (học viên nối tài khoản theo sđt, đăng ký chờ / nhận / danh sách chờ, tự nhận người chờ khi có chỗ), API coach / player / public (đăng ký nhanh + link `/coach/r/<token>`), trang Học viên, tab Học viên của lớp, nút Đăng ký trên trang công khai, *Lớp học của tôi* ở `/p`; Lịch dạy thêm Danh sách · Năm · Tháng · Tuần · Ngày (dùng lại `EventCalendar`) | xong |
| C4 ✅ (29/10) | Migration `20270102090000_coach_attendance.sql` (coach_package_purchases, coach_attendance, coach_session_fees), `coachAttendance` (quy định trừ buổi, trừ / trả lại gói, phí theo buổi, báo nghỉ đúng hạn / trễ hạn, hoàn tất buổi), API điểm danh / quét QR / gói đã mua / phí, trang buổi, popup học viên (gói + lịch sử), *Tôi không đi được* ở `/p` và trang `/coach/r/<token>`; test `coachAttendance.test.js` | xong |
| C5 ✅ (30/10) | Migration `20270103090000_coach_money.sql`; `coachMoney` (học viên mua gói → VietQR + mã `NZC…` → ảnh chuyển khoản → coach xác nhận / từ chối; ghi / huỷ khoản thu khi gói / phí đã thu; hoàn tiền một phần; sổ thu chi; email Resend; xoá ảnh sau 90 ngày); trang **Tiền** (`/coach/money`), Mua gói ở trang công khai / `/p` / `/coach/r/<token>`, Hoàn tiền trong popup học viên, chuông học viên. **Đổi so với kế hoạch:** sổ coach là bảng riêng `coach_ledger` thay vì `transactions.owner_type='coach'` (không phải sửa enum + ràng buộc của sổ CLB, không đụng các view tiền CLB) | xong |
| C6 | Owner: danh sách coach, khoá; README §4 mục mới, §11.2, §12, §15, §16, §17; `docs/ui-plan.md`; test backend | 1–2 ngày |
| C7 (GĐ2) | Lịch rảnh và đặt 1-1, ghi chú tiến bộ, đánh giá, tìm coach ở `/discover` | sau khi dùng thử |

## 9. Bảo mật và quy tắc

- Chỉ tài khoản **đã xác nhận email** mới mở hồ sơ coach; hồ sơ bị Owner khoá thì trang công khai 404 và API coach trả 403.
- Coach chỉ thấy học viên của mình; sđt học viên chỉ coach thấy (trợ giảng và trang công khai không).
- Chứng từ chuyển khoản: ≤ 400 KB, xoá sau 90 ngày, không log.
- Rate limit cho API public coach như `/api/public`.
- Không secret mới; tài khoản nhận tiền là của chính coach (`users.bank_*`), coach tự nhập ở *Nhận tiền*.
- Audit: Owner khoá / mở ghi `owner_audit_logs`; coach sửa hồ sơ / huỷ buổi ghi `activity_log` riêng (giai đoạn 2).

## 10. Quyết định đã chốt (29/10)

1. **Tên**: menu ghi **Coach**, mô tả / câu chữ dùng *huấn luyện viên*.
2. **Đăng ký**: cả hai cách như CLB / Social Manager — có tài khoản (đăng ký đầy đủ, xem lịch, gói, báo nghỉ) **và** đăng ký nhanh không tài khoản (tên + số điện thoại + gói / buổi → mã vé). Người đăng ký nhanh được **nối tự động** vào hồ sơ khi sau này tạo tài khoản bằng cùng số điện thoại (giống "---" chờ nối). Bảng `coach_students` vì thế có `user_id` cho phép trống + `phone` để nối; `coach_enrollments` / `coach_package_purchases` trỏ `student_id`, không trỏ `user_id`.
3. **Trừ buổi của gói**: mặc định trừ khi *có mặt* **hoặc** *vắng không báo trước hạn* (`cancel_hours`); *báo nghỉ đúng hạn* không trừ. Coach chỉnh được trong *Hồ sơ Coach → Quy định lớp*: cột `coach_profiles.deduct_mode` (`present_or_noshow` mặc định | `present_only` | `always`), có thể ghi đè theo lớp (`coach_classes.deduct_mode` nullable).
4. **Hoàn tiền một phần** khi học viên bỏ ngang: có. Trên gói đang dùng, coach bấm *Hoàn tiền* → nhập số tiền (gợi ý = giá × buổi còn lại / tổng buổi, làm tròn 1.000 đ) + lý do → gói chuyển `refunded`, `refund_amount`, `refunded_at`, ghi một khoản **chi** hạng mục *Hoàn tiền* vào sổ (có thể tick *Không tính*). Bảng `coach_package_purchases` thêm `refund_amount`, `refund_reason`, `refunded_at`.
5. **Hồ sơ công khai mặc định** (`public = true`); coach tắt được trong *Hồ sơ Coach* → chỉ ai có link mới xem (trang công khai vẫn mở bằng link, không xuất hiện ở tìm kiếm / `/discover`).

## 11. Phát hành an toàn: công tắc `coach_enabled` (đã chốt 29/10)

- Khoá `coach_enabled` (mặc định **tắt**) trong `app_settings`, Owner bật / tắt ở Owner Console → Hệ thống; kèm `COACH_BETA_EMAILS` (danh sách email thử, phân cách bằng dấu phẩy, đặt ở biến môi trường backend).
- Khi tắt: không có ô Coach ở `/home`, không có mục trong bộ chuyển ngữ cảnh, không có lựa chọn *Mở hồ sơ Coach*; `/coach/...` trả 404; API coach trả 403 — **trừ** tài khoản có email trong danh sách thử. Người dùng thật không thấy gì khác.
- Migration chỉ thêm bảng / cột mới nên chạy lên production an toàn. Làm xong C1–C5, thử thật với vài coach, rồi bật cho mọi người.
- Cùng cơ chế sẽ dùng cho **Tournament Manager** sau này (`tournament_enabled`, `TOURNAMENT_BETA_EMAILS`).
- Bổ trợ: `corsOptions` nhận mẫu tên miền preview của Vercel (`https://<project>-git-*-<team>.vercel.app`) để xem giao diện trước khi gộp; biến môi trường Preview trên Vercel, Redirect URL trên Supabase Auth, hostname trên Turnstile do bạn tự cấu hình (README §12 sẽ ghi hướng dẫn, không gửi giá trị vào chat).

## 12. Điểm vào (ai bắt đầu từ đâu)

- **Đăng nhập xong vẫn về `/home`** như hiện nay; không có trang chủ riêng cho coach.
- **Coach đã có hồ sơ**: ô **Coach** trong dải *Không gian của bạn* ở `/home` → vào không gian coach. Trong không gian CLB / Social Manager, bộ chuyển ngữ cảnh (`ContextSwitcher`) có thêm mục *Coach*.
- **Chưa có hồ sơ**: thẻ *Bạn là huấn luyện viên? Mở hồ sơ Coach* trên `/home` (ẩn được, nhớ bằng localStorage) và lựa chọn **Mở hồ sơ Coach** trong màn *Tạo CLB / Cộng đồng mới* (`/clubs`). Không duyệt, không thanh toán; cần email đã xác nhận.
- **Học viên có tài khoản**: cùng `/home`; buổi học sắp tới nằm chung danh sách *Sắp tới theo ngày* với các kèo; `/p` thêm tab **Lớp học**.
- **Học viên mới**: vào qua link `/coach/<slug>` coach gửi (mở được khi chưa đăng nhập; chọn *Đăng ký nhanh* hoặc *Đăng nhập để đăng ký*), hoặc (giai đoạn 2) qua *Tìm kèo / CLB* → tab Coach.
- **Owner**: `/owner/coaches` trong Owner Console.
