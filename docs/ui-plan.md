# Kế hoạch giao diện (UI/UX)

> Rà soát ngày 2026-10-22, dựa trên mã nguồn (chưa có ảnh chụp: web chưa chạy và các trang cần tài khoản Supabase thật). Cập nhật file này sau mỗi đợt.

## 1. Danh sách trang theo nhóm
- **Khung chung / menu**:
  - `components/AppShell.js`: khung cho chủ CLB và cộng đồng. Thanh bên ở máy tính; ở điện thoại là thanh tab dưới cùng và bảng "Thêm".
  - `PlayerShell.js`: khung người chơi, thu gọn ở 1024px.
  - `OwnerShell.js`: khung chủ ứng dụng, dùng màu hổ phách, thu gọn ở 1024px.
  - Các banner dùng chung trong `app/layout.js`.
- **Người chơi**: `/home`, `/p`, `/p/profile`, `/discover`, `/discover/[clubId]`, `/c/[clubId]`, `/rankings`, `/leaderboard`, `/onboarding`, `/welcome`, `/claim`, `/invite`, `/join`, `/l`, `/s`, `/v`.
- **Lịch & kèo**: `/events`, `/events/create`, `/events/create/weekly`, `/events/[id]`, `/events/[id]/edit`, `/e/[token]`, `/g/...`, `/t/[code]`, `/live/...`, `/staff`, `/staff/[eventId]`, `/club/matches`, `/club/tournaments/*`.
- **Thành viên**: `/club/members/*` (all, new, guests, requests, review, dupr), `/club/roster`, `/club/attendance`, `/club/dupr`.
- **Tài chính & thống kê**: `/finance`, `/finance/ledger`, `/finance/plans`, `/finance/inventory`, `/dashboard`, `/analytics`, `/club/insights`, `/club/business`, `/club/business/finance`, `/club/race`, `/club/rankings`, `/club/reviews`, `/club/featured`.
- **Cài đặt**: `/account`, `/clubs`, `/club/community-settings`, `/staff-access`, `/club/activity-log`, `/club-request`, `/contact`, `/mfa-reset`, `/reset-password`, `/verify-email`.
- **Owner**: `/owner` và 16 trang con (hosts, clubs, payments, analytics, audit, announcements, …), cùng `/admin/payments`.
- **Trang giới thiệu**: `/` (`components/Landing.js`, 1045 dòng), `/sign-in`, `/privacy`, `/terms`.

## 2. Ba vấn đề lớn nhất của mỗi nhóm

### Vấn đề chung (ảnh hưởng mọi nhóm)
- Khoảng 1.000 emoji đang dùng làm biểu tượng, trải trên 147 file, trong khi đã có bộ `UiIcon`. Như vậy hai hệ biểu tượng đang tồn tại song song.
- Có 126 chỗ cắt chữ (`truncate` / `line-clamp`) trong 58 file.
- Khoảng 30 cặp nút đặt nút chính bên trái.
- Có 1.077 chỗ dùng `text-xs` (12px). Trên điện thoại, chữ nội dung cần tối thiểu 14px.
- Không có component chung cho trạng thái trống / đang tải / lỗi.
- Ngoài ba bảng màu chính, code còn dùng nhiều họ màu khác: đỏ, hổ phách, xanh trời, vàng, cam, tím, hồng.
- App dùng font hệ thống, còn trang giới thiệu dùng Plus Jakarta Sans.

### Khung chung / menu
- **Máy tính**:
  - (1) Ba khung có ba kiểu đánh dấu mục đang chọn khác nhau: ô xanh chanh, thanh trái xanh chanh, và màu hổ phách ở Owner.
  - (2) Tiêu đề nhóm menu viết HOA và giãn chữ. Tên mục bị cắt (`AppShell.js:521,536`).
  - (3) Thanh bên chồng nhiều lớp: chuyển không gian, về trang chủ, liên hệ, chọn ngôn ngữ, đăng xuất. Trong khi đó vùng nội dung có một hàng trống chỉ để đặt chuông.
- **Điện thoại**:
  - (1) Nhãn tab dưới cùng bị cắt bằng `line-clamp-2` (`AppShell.js:743`).
  - (2) Các mục trong bảng "Thêm" chia lưới 2 cột với chữ 13px, nhãn dài bị dồn chật.
  - (3) Ở người chơi, thanh tab dưới hiện tới 1024px; ở khung quản lý, tab dưới chỉ hiện tới 768px. Hai khung không nhất quán.

### Người chơi
- **Máy tính**:
  - (1) Nội dung bị giới hạn `max-w-5xl` (1024px), nên ở màn 1440px hai bên trống khoảng 200px mỗi bên.
  - (2) Dùng nền chuyển màu (`bg-gradient`) ở `discover` và `c/[clubId]`.
  - (3) Chưa có trang nào trả lời ngay câu hỏi "trận tiếp theo của tôi là khi nào".
- **Điện thoại**:
  - (1) Chữ phụ 12px ở thẻ kèo và yêu cầu.
  - (2) Tên CLB và tên người bị cắt chữ.
  - (3) Thanh trên cùng có nút EN/VI dạng viên thuốc, khác kiểu ô chọn ngôn ngữ của khung quản lý.

### Lịch & kèo
- **Máy tính**:
  - (1) Các file quá dài: `events/[eventId]/page.js` 733 dòng, `EventForm.js` 869 dòng. Trang này dồn mọi thứ vào một cột dài.
  - (2) Nút Lưu/Tạo nằm bên trái (`EventForm.js:780,854`).
  - (3) Thẻ lịch dùng khoảng 12 họ màu (`lib/clubColors.js`), làm nhiễu màu nhấn.
- **Điện thoại**:
  - (1) Lịch (`EventCalendar.js`) cắt tên kèo ở 5 chỗ.
  - (2) Trang `live/[tid]` cắt chữ và dùng bảng nhiều cột.
  - (3) Biểu mẫu tạo kèo dài, các nhãn dùng emoji.

### Thành viên
- **Máy tính**:
  - (1) Bảng kiểu bảng tính (`.grid-table`), kẻ viền mọi ô, gây nặng mắt.
  - (2) `MembersPage.js` (626 dòng) dùng khoảng 27 emoji làm nhãn và trạng thái.
  - (3) Trang `attendance` (686 dòng) là lưới rất rộng, số chưa căn phải ở mọi chỗ.
- **Điện thoại**:
  - (1) Bảng chỉ cuộn ngang (`.table-wrap` với `min-width: 36rem`), chưa đổi thành danh sách 2 dòng.
  - (2) Nút Duyệt/Từ chối trên từng dòng có thể thành một chồng nút.
  - (3) Cột ghi chú và nhãn trạng thái bị bóp hẹp.

### Tài chính & thống kê
- **Máy tính**:
  - (1) Bảng điều khiển: các thẻ KPI có emoji (👥📅🎚️). Số liệu chính bị gấp vào mục "Xem thêm thống kê".
  - (2) `/finance` và `/finance/ledger` dùng nền chuyển màu. Biểu đồ dùng mã màu cứng lệch bảng màu (`TrendBars`, `FormChart`, `DuprChart`).
  - (3) `club/insights` (452 dòng) có khoảng 25 emoji, nhiều thẻ giống nhau xếp lưới.
- **Điện thoại**:
  - (1) Ba ô tiền ép vào 3 cột chữ 14px (`dashboard:292`), số tiền dài dễ chật.
  - (2) Sổ thu chi (`ledger`, 495 dòng) là bảng cuộn ngang.
  - (3) Biểu đồ chưa có quy ước chiều cao và số nhãn trục cho màn hẹp.

### Cài đặt
- **Máy tính**:
  - (1) `/account` có khoảng 24 emoji. Các mục xếp một cột hẹp, phần bên phải màn hình bỏ trống.
  - (2) Có 13 file tự dựng thanh tab thay vì dùng `Segmented` / `UnderlineTabs`.
  - (3) Mỗi trang lưu theo một kiểu khác nhau, nút Lưu không cố định vị trí.
- **Điện thoại**:
  - (1) `club-request` (406 dòng) có khoảng 28 emoji và biểu mẫu dài.
  - (2) `staff-access` (390 dòng) có bảng quyền nhiều cột.
  - (3) Nút nguy hiểm (xoá CLB) chưa tách thành mục riêng ở cuối.

### Owner
- **Máy tính**:
  - (1) Màu nhấn hổ phách và nền `navy-900/60` lệch khỏi thương hiệu.
  - (2) `owner/hosts/[id]` (594 dòng) có khoảng 21 emoji, và nút chính bên trái (`:310`).
  - (3) `owner/analytics` dùng mã màu cứng.
- **Điện thoại**:
  - (1) Menu ngăn kéo bên trái khác hẳn tab dưới cùng của hai khung kia.
  - (2) Các bảng như `hosts`, `payments` và `audit` cắt chữ và cuộn ngang.
  - (3) Trang `announcements` có khoảng 23 emoji.

### Trang giới thiệu
- **Máy tính**:
  - (1) Dùng nhiều hiệu ứng bị taste-skill cấm: chữ chuyển màu lấp lánh, đốm mờ phát sáng, nút phát sáng nhấp nháy, con trỏ chuột tuỳ biến (`globals.css:184-303`).
  - (2) Font Plus Jakarta Sans chỉ có ở trang này.
  - (3) `Landing.js` dài 1045 dòng, cắt chữ ở 4 chỗ.
- **Điện thoại**:
  - (1) Các cảnh chuyển xếp chồng thành trang rất dài.
  - (2) Trang đăng nhập có đốm mờ chuyển động và mã màu cứng.
  - (3) Các trang `privacy` / `terms` cần kiểm tra độ dài dòng và cỡ chữ.

---

## 3. Kế hoạch theo đợt
Quy trình chung cho mỗi đợt:
- chụp ảnh trước và sau ở 1440px và 390px;
- chạy `npm run build` trong `web/`;
- cập nhật README và `docs/ui-plan.md`;
- commit riêng cho từng đợt.

**Đợt 0 – Chuẩn bị ảnh chụp.** Cần bạn chạy `npm run dev` và cung cấp một tài khoản thử (chủ CLB và người chơi). Sau đó chạy `inspect.mjs --app` cho từng nhóm, lưu ảnh vào thư mục scratchpad, không lưu trong repo.

**Đợt 1 – Nền tảng (ảnh hưởng mọi trang, ít rủi ro):**
- Thêm token màu và cỡ chữ vào `tailwind.config.js` / `globals.css`.
- Thêm `EmptyState`, `LoadingBlock`, `ErrorBlock` vào `components/ui/`.
- Thêm lớp `.num`: căn phải, `tabular-nums`, hiển thị "—" màu xám khi trống.
- Thêm quy ước nút chính bên phải cho `Modal` và chân biểu mẫu.

**Đợt 2 – Khung chung:**
- Thống nhất cách đánh dấu mục đang chọn (một kiểu xanh chanh).
- Bỏ chữ HOA và cắt chữ trong menu.
- Thống nhất điểm thu gọn tab dưới cùng cho cả ba khung.
- Đưa chuông và ngôn ngữ về một chỗ.
- Owner chuyển sang màu thương hiệu.

**Đợt 3 – Bỏ emoji làm biểu tượng.** Thay bằng `UiIcon` hoặc chữ. Làm theo file, ưu tiên các file có nhiều emoji nhất: EventForm, events/[id], MembersPage, PlanModals, account, club-request, dashboard. Kiểm tra cả emoji nằm trong `vi.js` / `en.js`.

**Đợt 4 – Bảng thành danh sách trên điện thoại.** Áp dụng cho members, attendance, ledger, inventory, staff-access và các bảng owner. Dưới 640px, mỗi dòng bảng thành danh sách 2 dòng. Đồng thời bỏ cắt chữ ở 126 chỗ.

**Đợt 5 – Lịch & kèo.** Gồm EventForm, events/[id], EventCalendar và live:
- nút chính bên phải;
- tách thành từng phần rõ ràng;
- giảm số màu trên lịch.

**Đợt 6 – Tài chính & thống kê.**
- Sắp lại bảng điều khiển: việc cần làm, kèo sắp tới, tiền.
- KPI chỉ gồm nhãn và số, không có biểu tượng.
- Biểu đồ dùng một màu nhấn, lấy màu từ token.
- Bỏ nền chuyển màu.

**Đợt 7 – Người chơi và cài đặt.**
- Nới độ rộng nội dung ở 1440px.
- Gom các thanh tab về `Segmented`.
- Đặt nút Lưu cố định; tách mục nguy hiểm thành mục riêng ở cuối.

**Đợt 8 – Trang giới thiệu.** Chạy taste-skill theo phần page cho trang `/`, bỏ chữ chuyển màu, đốm mờ, nút phát sáng và con trỏ tuỳ biến. Trang đăng nhập làm cùng đợt.

Thứ tự trên được chọn vì đợt 1 và 2 sửa chung một lần mà có tác dụng cho mọi trang. Đợt 3 và 4 là các lỗi lặp lại nhiều nhất trên điện thoại. Các đợt sau đi theo từng nhóm trang, nhóm nào người dùng mở nhiều hơn thì làm trước.

## Nhật ký các đợt

| Đợt | Trạng thái | Ghi chú |
| --- | --- | --- |
| 0 – Ảnh chụp | Chưa làm | Cần chạy `npm run dev` và tài khoản thử |
