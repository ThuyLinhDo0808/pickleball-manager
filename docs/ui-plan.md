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

Quy trình chung cho mỗi đợt (theo CLAUDE.md):
1. Chụp ảnh **trước** ở 1440px và 390px các trang của đợt.
2. Sửa giao diện. Không đổi tính năng, API hay đường dẫn. Chữ mới phải thêm khoá vào cả `web/lib/i18n/vi.js` và `en.js`.
3. Chạy `npm run build` trong `web/`, chụp ảnh **sau**, so sánh với ảnh trước.
4. Cập nhật README (nếu thay đổi những gì người dùng thấy) và bảng theo dõi ở cuối file này, rồi commit riêng cho đợt.

Thứ tự được chọn theo nguyên tắc:
- Đợt 1–2 sửa một lần mà có tác dụng cho mọi trang, rủi ro thấp.
- Đợt 3–4 xử lý các lỗi lặp lại nhiều nhất (emoji, cắt chữ, bảng trên điện thoại).
- Đợt 5–8 đi theo từng nhóm trang; nhóm nào người dùng mở nhiều hơn thì làm trước.

### Đợt 0 – Chụp ảnh hiện trạng
- **Việc:**
  - Chạy web bằng `npm run dev` trong `web/`, đăng nhập bằng tài khoản thử với hai vai trò: chủ CLB và người chơi.
  - Chụp các trang tiêu biểu của mọi nhóm ở 1440px và 390px.
  - Đo bằng `inspect.mjs --app` của taste-skill, riêng trang `/` đo theo phần page.
  - Bổ sung vào mục 2 những vấn đề chỉ thấy được trên ảnh.
- **Trang:** `/`, `/sign-in`, `/home`, `/p`, `/discover`, `/dashboard`, `/events`, `/events/[id]`, `/events/create`, `/club/members/all`, `/club/attendance`, `/finance`, `/finance/ledger`, `/account`, `/staff-access`, `/owner`, `/owner/hosts`.
- **File:** không sửa file nào. Ảnh lưu ngoài repo.

### Đợt 1 – Nền tảng dùng chung
- **Việc:**
  - Thêm token cho màu, cỡ chữ và bo góc. Tách màu trạng thái thành 3 cặp: tốt, xấu, cần chú ý.
  - Thêm lớp `.num`: căn phải, `tabular-nums`, hiện "—" màu xám khi trống.
  - Thêm các khối dùng chung cho trạng thái trống / đang tải / lỗi.
  - Chân nút của hộp thoại: nút chính bên phải, nút phụ bên trái.
  - Chọn một font cho toàn app.
- **Trang:** chưa đổi trang nào. Các đợt sau dùng lại những thứ này.
- **File:**
  - `web/tailwind.config.js`, `web/app/globals.css`
  - `web/components/Modal.js`, `web/components/ui/GuideModal.js`
  - File mới: `web/components/ui/EmptyState.js`, `LoadingBlock.js`, `ErrorBlock.js`
  - `web/components/ui/UiIcon.js`: bổ sung các biểu tượng còn thiếu.

### Đợt 2 – Khung chung / menu
- **Việc:**
  - Một kiểu đánh dấu mục đang chọn (xanh chanh) cho cả 3 khung. Owner bỏ màu hổ phách.
  - Bỏ chữ HOA và chữ giãn trong tiêu đề nhóm menu. Bỏ cắt chữ ở tên mục và nhãn tab dưới cùng.
  - Thống nhất độ rộng màn hình mà tại đó cả 3 khung chuyển sang tab dưới cùng.
  - Đưa chuông, ngôn ngữ và đăng xuất về cùng một chỗ, cùng một kiểu.
  - Trên điện thoại, bảng "Thêm" xếp một cột, chữ ≥14px, vùng bấm ≥44px.
- **Trang:** mọi trang, vì đây là phần khung bao quanh.
- **File:**
  - `web/components/AppShell.js`, `PlayerShell.js`, `OwnerShell.js`
  - `ContextSwitcher.js`, `SignupBell.js`, `PlayerBell.js`, `BackButton.js`
  - `web/components/ui/PageHeader.js`: bỏ cắt chữ ở tiêu đề.

### Đợt 3 – Bỏ emoji làm biểu tượng
- **Việc:**
  - Thay emoji bằng `UiIcon` hoặc bằng chữ.
  - Bỏ emoji trong các chuỗi i18n, giữ nghĩa câu.
  - Làm theo từng file, bắt đầu từ file có nhiều emoji nhất.
- **Trang:** dashboard, events, account, club-request, members, insights, owner.
- **File (theo thứ tự ưu tiên):**
  - `web/components/EventForm.js`, `web/app/events/[eventId]/page.js`
  - `web/components/MembersPage.js`, `web/app/club-request/page.js`
  - `web/components/PlanModals.js`, `web/app/club/insights/page.js`
  - `web/app/dashboard/page.js`, `web/app/account/page.js`
  - `web/app/owner/announcements/page.js`, `web/app/owner/hosts/[id]/page.js`
  - `web/components/stats/CommunityBusiness.js`, `web/components/MeetingEvent.js`
  - `web/components/AppShell.js`, `web/components/ui/StatTile.js`, `web/components/ui/PageHeader.js`
  - `web/lib/i18n/vi.js`, `web/lib/i18n/en.js`
  - Các file còn lại trong 147 file có emoji, xử lý dần.

### Đợt 4 – Bảng thành danh sách trên điện thoại, bỏ cắt chữ
- **Việc:**
  - Dưới 640px, mỗi dòng bảng thành 2 dòng:
    - dòng 1: tên và số chính;
    - dòng 2: các trường còn lại, chữ xám;
    - thao tác đặt bên phải.
  - Trên máy tính, bảng bỏ kẻ viền từng ô, chỉ giữ đường kẻ ngang mờ. Số căn phải.
  - Bỏ 126 chỗ `truncate` / `line-clamp`, cho chữ xuống dòng.
- **Trang:** `/club/members/*`, `/club/attendance`, `/club/roster`, `/finance/ledger`, `/finance/inventory`, `/staff-access`, `/owner/hosts`, `/owner/payments`, `/owner/audit`.
- **File:**
  - `web/app/globals.css`: các lớp `.grid-table` và `.table-wrap`.
  - `web/components/MembersPage.js`, `MemberDetail.js`, `MemberModeration.js`, `DuprMembers.js`
  - `web/app/club/attendance/page.js`, `web/app/club/roster/page.js`
  - `web/app/finance/ledger/page.js`, `web/app/finance/inventory/page.js`
  - `web/app/staff-access/page.js`
  - `web/app/owner/hosts/page.js`, `web/app/owner/payments/page.js`, `web/app/owner/audit/page.js`
  - Các file có cắt chữ: `web/app/l/[token]/page.js`, `TeamLeagueView.js`, `EventCalendar.js`, `web/app/live/[tid]/page.js`, …

### Đợt 5 – Lịch & kèo
- **Việc:**
  - Nút Lưu/Tạo đặt bên phải.
  - Biểu mẫu tạo kèo chia thành các phần có tiêu đề rõ.
  - Trang chi tiết kèo: thông tin chính và thao tác chính lên đầu.
  - Lịch: giảm từ khoảng 12 họ màu xuống ít màu, và không cắt tên kèo.
  - Trang tỉ số trực tiếp đọc được trên điện thoại.
- **Trang:** `/events`, `/events/create`, `/events/create/weekly`, `/events/[id]`, `/events/[id]/edit`, `/e/[token]`, `/g/...`, `/t/[code]`, `/live/...`, `/staff`, `/staff/[eventId]`, `/club/matches`, `/club/tournaments/*`.
- **File:**
  - `web/components/EventForm.js`, `EventSignup.js`, `EventPeople.js`, `EventCalendar.js`, `MeetingEvent.js`
  - `web/lib/clubColors.js`
  - `web/app/events/page.js`, `web/app/events/[eventId]/page.js`
  - `web/app/live/[tid]/page.js`, `web/app/live/[tid]/[liveId]/page.js`
  - `web/app/club/tournaments/new/page.js`, `web/app/club/tournaments/[id]/page.js`
  - `web/app/staff/page.js`

### Đợt 6 – Tài chính & thống kê
- **Việc:**
  - Bảng điều khiển trả lời câu hỏi chính trước, theo thứ tự: việc cần làm, kèo sắp tới, tiền tháng này.
  - Các số liệu chính không bị gấp vào mục "Xem thêm thống kê".
  - KPI chỉ còn nhãn và số: không biểu tượng, không ô màu.
  - Biểu đồ dùng một màu nhấn, màu lấy từ token, nhãn trục gọn trên điện thoại.
  - Bỏ nền chuyển màu.
  - Ba ô tiền trên điện thoại thành danh sách: nhãn bên trái, số bên phải.
- **Trang:** `/dashboard`, `/finance`, `/finance/ledger`, `/finance/plans`, `/analytics`, `/club/insights`, `/club/business`, `/club/business/finance`, `/club/race`, `/club/rankings`, `/club/reviews`, `/club/featured`, `/club/dupr`.
- **File:**
  - `web/app/dashboard/page.js`, `web/app/finance/page.js`, `web/app/finance/plans/page.js`
  - `web/app/club/insights/page.js`, `web/app/analytics/page.js`
  - `web/components/stats/CommunityBusiness.js`, `ClubLeaderboard.js`
  - `web/components/TrendBars.js`, `FormChart.js`, `DuprChart.js`
  - `web/components/ui/KpiRow.js`, `StatTile.js`
  - `web/lib/finance.js`

### Đợt 7 – Người chơi và cài đặt
- **Việc:**
  - Người chơi:
    - nới độ rộng nội dung ở 1440px (hiện tối đa 1024px);
    - trang chủ trả lời "kèo tiếp theo của tôi";
    - bỏ nền chuyển màu.
  - Cài đặt:
    - gom 13 thanh tab tự dựng về `Segmented` / `UnderlineTabs`;
    - mỗi trang một kiểu lưu, nút Lưu bên phải cuối mỗi phần;
    - mục nguy hiểm (xoá) tách thành phần riêng ở cuối, có xác nhận.
  - Hướng dẫn chuyển sang popup (i).
- **Trang:** `/home`, `/p`, `/p/profile`, `/discover`, `/discover/[clubId]`, `/c/[clubId]`, `/rankings`, `/leaderboard`, `/onboarding`, `/welcome`, `/account`, `/clubs`, `/club/community-settings`, `/staff-access`, `/club/activity-log`, `/club-request`, `/contact`.
- **File:**
  - `web/components/PlayerShell.js`
  - `web/app/home/page.js`, `web/app/p/page.js`, `web/app/p/profile/page.js`
  - `web/app/discover/page.js`, `web/app/c/[clubId]/page.js`
  - `web/components/HomeRankings.js`, `CommunityOverview.js`
  - `web/app/account/page.js`, `web/components/AccountSecurity.js`
  - `web/app/clubs/page.js`, `web/app/club/community-settings/page.js`
  - `web/app/club-request/page.js`, `web/components/ui/Segmented.js`, `web/components/ui/Hint.js`

### Đợt 8 – Trang giới thiệu và đăng nhập
- **Việc:**
  - Trang `/` làm theo phần page của taste-skill.
  - Bỏ chữ chuyển màu lấp lánh, đốm mờ phát sáng, nút phát sáng nhấp nháy và con trỏ tuỳ biến.
  - Dùng chung font với app.
  - Bỏ cắt chữ.
  - Trên điện thoại, trang ngắn gọn hơn.
- **Trang:** `/`, `/sign-in`, `/privacy`, `/terms`, `/reset-password`, `/verify-email`.
- **File:**
  - `web/components/Landing.js`
  - `web/app/globals.css`: các lớp `lp-*`.
  - `web/app/sign-in/page.js`, `web/app/privacy/page.js`, `web/app/terms/page.js`

## 4. Bảng theo dõi

| Đợt | Trạng thái | Ghi chú |
| --- | --- | --- |
| 0 – Chụp ảnh hiện trạng | bỏ qua | Người dùng chọn bỏ; các đợt sau không có ảnh trước/sau |
| 1 – Nền tảng dùng chung | xong | Token màu `good/bad/warn/ink`, cỡ chữ `meta/body/title`, bo góc `control/card/sheet` (tailwind + biến CSS `--c-*`); lớp `.num`, `.dash`, `.pill-*`, `.dialog-actions`; `Modal` có `footer`, nút × 44px; `EmptyState`, `LoadingBlock`, `ErrorBlock`, `Num`; 45 biểu tượng mới trong `UiIcon`; Plus Jakarta Sans cho toàn app |
| 2 – Khung chung / menu | xong | `NAV_ACTIVE` (`lib/nav.js`) = một kiểu đánh dấu cho 3 khung; Owner bỏ hổ phách, điện thoại dùng tab dưới + bảng *Thêm* thay ngăn kéo; cả 3 khung chuyển tab dưới ở <1024px; tiêu đề nhóm bỏ IN HOA, bỏ cắt chữ tên mục / nhãn tab; chuông + ngôn ngữ + đăng xuất cùng một hàng cuối thanh bên (`SignupBell side`), `LangSelect` dùng chung; bảng *Thêm* một cột, 15px, ≥44px; `PageHeader` bỏ ô biểu tượng tô màu và cắt chữ; `ClubAvatar`/`ContextSwitcher` bỏ emoji |
| 3 – Bỏ emoji làm biểu tượng | xong | ~1.000 emoji trong 140+ file và i18n: emoji đứng riêng → `UiIcon`, emoji kèm chữ → bỏ; prop `icon` truyền tên `UiIcon`; `StatTile` bỏ biểu tượng, `SettingsSection`/`UnderlineTabs` vẽ `UiIcon`; huy chương → số hạng; chỉ còn ký hiệu chữ ✓ ✕ ★. README bỏ emoji theo |
| 4 – Bảng thành danh sách, bỏ cắt chữ | xong | `.grid-table` chỉ còn kẻ ngang, tiêu đề xám không dải nền; lớp `.mobile-list` (+ `.first`, `.key`, `.act`, `data-label`) đổi bảng thành danh sách 2 dòng dưới 640px, áp cho ledger ×3, finance ×2, EventFinance, nhật ký kho, gói (attendance), DuprMembers, owner/clubs; thành viên và owner/hosts đã có danh sách riêng; ma trận (điểm danh, khách, quyền) giữ cuộn ngang. 106 chỗ `truncate`/`line-clamp` → `break-words` (51 file); còn 4 ở `Landing.js` để Đợt 8. `roster`, `owner/payments`, `owner/audit` không dùng `<table>` nên không đổi |
| 5 – Lịch & kèo | xong | `EventForm`: bỏ số thứ tự phần, Huỷ trái / Tạo-Lưu phải (điện thoại + khung xem trước), bỏ nền mờ kính; trang kèo: nút chính *Gửi link* sang phải; `clubColors.js`: 12 họ màu → nền navy + 4 chấm màu; `STATUS_STYLE` dùng token good/bad/warn và xám; bỏ toàn bộ violet/indigo/fuchsia (18 file), bảng màu `ClubAvatar` dịu hơn; chữ `text-xs` 13px trên điện thoại. Trang `live` đã một cột trên điện thoại, cắt chữ đã bỏ ở Đợt 4. Chưa tách `events/[eventId]/page.js` (733 dòng) — chỉ đổi giao diện |
| 6 – Tài chính & thống kê | xong | Dashboard: bỏ gradient đầu trang, *Tiền tháng này* 1 khối 4 mục (thêm *còn phải thu*), danh sách nhãn–số trên điện thoại, bỏ `<details>` *Xem thêm thống kê*; KPI (`Kpi`, `Tile`, `StatTile`, ô kho/sổ) chỉ nhãn + số; `lib/chartTheme.js` dùng cho FinanceTrend/FormChart/DuprChart/TrendBars/owner analytics và `INCOME_COLOR`/`EXPENSE_COLOR`; bỏ mọi `bg-gradient`, đốm `blur`, `backdrop-blur` (trừ Landing/sign-in → Đợt 8). Chưa tách `club/insights` thành bố cục khác |
| 7 – Người chơi và cài đặt | xong | `/home`: khối *Kèo tiếp theo* + `LoadingBlock`/`ErrorBlock`; `PlayerShell` max-w-6xl; `Segmented` chọn = navy (không lime), 44px; 6 thanh tab tự dựng → `Segmented`/`UnderlineTabs` (tournament KO, discover club, leaderboard ×2, owner activity/clubs/analytics); tab Tài khoản / phase `/c` cùng kiểu chip, *Xoá tài khoản* tách cuối; 13 cặp nút đổi chỗ (nút chính phải); thanh Lưu cài đặt cộng đồng. Còn lại: các thanh tab có chức năng riêng (tab kèo có biểu tượng, lọc CLB có chấm màu) giữ code riêng; màu hổ phách trong nội dung trang Owner (~38 chỗ, phần lớn là cảnh báo) chưa rà |
| 8 – Trang giới thiệu và đăng nhập | huỷ (giữ nguyên) | Chủ dự án muốn giữ hiệu ứng đặc trưng (chữ lấp lánh, đốm sáng, nút phát sáng, con trỏ riêng, dải sáng quét, số cảnh, nhãn IN HOA đánh số, bóng, kính mờ) ở trang giới thiệu và đăng nhập; Đợt 8 đã được hoàn tác. Quy tắc "không gradient / kính mờ / emoji" chỉ áp dụng cho màn hình ứng dụng, không áp dụng cho 2 trang này. |
| J – Yêu cầu chủ dự án (22/10) | xong | Chuông người chơi cuộn + xoá tin; gói hội viên: bỏ dòng ví dụ, nút *Xóa gói* (hỏi lại); sổ thu chi cộng đồng mở ở *Theo buổi* (mỗi kèo một ô gấp/mở, *Mở hết / Thu gọn hết*), chỉ ghi Thu (*Tiền xé vé / Khác*); lịch thêm chế độ *Năm* (12 tháng nhỏ); *Hình thức* cộng đồng thêm *Người chơi mới*; bỏ *Thống kê tài chính* và tab *Bảng xếp hạng chung* khỏi menu cộng đồng; cài đặt Top tháng chuyển sang Bảng điều khiển; bảng xếp hạng có bục Top 1·2·3 dạng bậc thang, danh sách từ hạng 4; ô *VIP* ở trang Thành viên → *Gói hội viên* |
| K – Yêu cầu chủ dự án (22/10, lần 2) | xong | Tab đầu trang Tài chính: biểu tượng cùng hàng với chữ (máy tính + điện thoại, 44px trên điện thoại); trang Social Manager chưa có cộng đồng chỉ còn một khung (chưa mua: khung đăng ký; đã mua: *Tạo cộng đồng mới*); Top tháng chỉ còn công tắc Bật / Tắt, bỏ thẻ cài đặt giải thưởng khỏi Bảng điều khiển |
| L – Bảng điều khiển & xếp hạng (23/10) | xong | Bảng điều khiển cộng đồng làm lại: 3 nhóm (Thành viên · Đăng ký kèo · Trình độ & xếp hạng), mục lục trái (máy tính) / hàng nút nhảy (điện thoại), mỗi cài đặt một dòng nhãn trái – ô chỉnh phải, thanh Lưu báo *Có thay đổi chưa lưu*; mục Bảng xếp hạng mới (tab theo trình độ / khoảng DUPR tự đặt, xem trước tab). Xếp hạng người chơi bỏ *toàn web*; tab cộng đồng do Host đặt ở trang Host, trang cộng đồng và /rankings. Top tháng chỉ thống kê (bỏ quà, voucher) |
| M – Kèo, đăng ký & điều phối viên (23/10) | xong | Bảng người chơi: nút *Vào DS chính, thu tiền sau* (popup (i)) cho người chờ chuyển khoản / chờ duyệt / danh sách chờ, cả ở *Thanh toán cần xác nhận*; nhãn tiền *✓ Đã thu* / *Chưa thu · số tiền* ở mọi dòng và mỗi ô người chơi của bảng theo sân. Trang người chơi: khung vàng *còn … chưa thanh toán* khi Host đã xếp vào DS chính; ô *Số slots* (− / +, ≥44px) ở bước xác nhận và khung *Đi cùng bạn bè?* (nút chính phải). Số chỗ ghi *Đã có x/N slots*. Đặt nhanh: tự lưu bản nháp, khung *Mở đơn đã gửi*. Điều phối viên: thông tin sân / khung giờ ở đầu trang, tab *Xếp sân* chia theo sân (đổi sân bằng ô chọn, xếp trận tự động từng sân, ô *Chỉ xếp người đã đến*); Host có tab con *Xếp trận* cùng giao diện. Danh sách ở điện thoại vẫn 2 dòng, không cắt chữ |
| N – Xếp sân dạng ô (24/10) | xong | Điều phối viên: bảng theo sân dùng ô người chơi (ảnh, tên, giới tính · trình độ, Đã đến / Chưa đến) + ô *Slot trống* nét đứt; bấm ô mở popup *Đổi sân* (nút ≥44px). Trang người chơi: bỏ các dòng *đã được điều chuyển*, thêm ô Slot trống; chỉ báo khi kèo đổi giờ / bị huỷ. Host: nút *Xuất DS người chơi* (biểu tượng tải, bên phải) ở tab Người chơi |
| O – Điều phối viên giống Host (24/10) | xong | `components/CourtBoards.js` dùng chung cho Host + điều phối viên (ô người chơi, Check-in, DUPR · Uy tín %, Slot trống; tiền chỉ Host, không kèm số tiền). Tỷ số của điều phối viên = tab Trận đấu của Host (Nhập điểm · Kết quả · Xếp trận · Bảng xếp hạng buổi). Trang người chơi: Uy tín % ở từng ô, Slot trống cả kèo một sân |
| P – Trang cộng đồng, BXH buổi, gộp người chơi (24/10) | xong | `components/Podium.js` dùng chung (BXH CLB, trang cộng đồng, BXH buổi). Trang `/discover/<id>`: tab Lịch · Thành viên (ô người chơi) · Bảng xếp hạng (bục + hạng 4–10 danh sách 2 dòng). Lịch chơi của kèo: 4 tab, BXH buổi có bục, hạng 4+ thành danh sách 2 dòng. Sửa tỷ số: ô nhập luôn thẳng hàng khi tên xuống 2 dòng. Thanh toán cần xác nhận: nút xuống dòng, ≥44px, hết tràn ngang ở 390px |
| Q – DUPR ID khi đăng ký, xuất DUPR, ảnh trận (24/10) | xong | Trang Chào mừng và hồ sơ nhanh lúc vào kèo: ô **DUPR ID (không bắt buộc)** + popup (i) cách lấy ID, bỏ ô DUPR tự nhập. Tab Trận đấu: nút *Xuất file DUPR (.csv)* cạnh *Xuất ảnh*, mở popup Gửi trận lên DUPR (điền ID còn thiếu cả cho người đặt nhanh). Ảnh trận: lưới 2 cột, mỗi người một dòng, thu nhỏ chữ thay vì cắt, 16 trận / ảnh (nhiều ảnh khi nhiều trận). Update điểm DUPR: hàng nút nhóm Thường xuyên · Vãng lai · Người mới · Đặt nhanh (≥36px, đếm số), nhãn nhóm cạnh tên. Bảng người chơi: 3 ô chỗ mờ đi + dòng giải thích khi đã check-in / vắng |
| R – Tab con, chuông Host (25/10) | xong | `components/ui/UnderlineTabs.js` làm lại: một hàng tab gạch chân (icon + chữ + số), điện thoại vuốt ngang, tab đang chọn tự cuộn vào giữa, không xuống dòng; khác hẳn tab chính (ô xanh chanh). Áp dụng cho mọi tab con (lịch chơi người chơi, tab Trận đấu, trang CLB, BXH, Update điểm DUPR, BXH trang chủ…); 3 trạng thái *Sắp tới / Đang diễn ra / Đã qua* ở trang CLB người chơi thành ô chia đều (`Segmented`). Chuông Host: khung vẽ trên `document.body` (không bị nội dung trang đè), cuộn được, nút × từng tin + *Xóa tất cả*. Thành viên: bỏ nút *Hủy liên kết* |
| S – Trang kèo người chơi chia tab (25/10) | xong | `/e/<mã>`: 3 tab chính dạng ô (như tab chính trang kèo của Host) — Đăng ký / Vé (QR) · Lịch chơi (chỉ khi có chỗ) · Danh sách người chơi (N); tab con trong Lịch chơi đổi *Danh sách người chơi* → *Xếp sân* để không trùng tên |
| T – Gập nhóm lịch, đưa lại người bị huỷ (25/10) | xong | Lịch hoạt động (Danh sách): mọi nhóm có nút gập (mũi tên xoay, ≥44px trên điện thoại), *Đã xong* mặc định gập. Bảng người chơi đã huỷ (Host huỷ): nút *↺ Đưa lại vào danh sách* (viền xanh chanh, hỏi lại) cạnh *Xoá khỏi lịch sử* |
| U – Tên trong cộng đồng (biệt danh) (25/10) | xong | Form sửa thành viên có tài khoản: nhãn *Tên trong cộng đồng / CLB* + (i); bảng người chơi trong kèo thêm dòng nhỏ *Tên trên tài khoản: …* khi khác tên Host đặt |
| V – Bục BXH buổi, menu IN HOA, DUPR ID trong bảng, đổi email (25/10) | xong | `components/Podium.js`: cúp vàng / bạc / đồng trên mỗi bậc. `EventStandings` (trang kèo Host, điều phối viên): Top 3 trên bục, từ hạng 4 là bảng có viền + tiêu đề cột nền tối + số hạng trong vòng tròn + dòng xen màu; trang người chơi: danh sách có hàng tiêu đề, cùng kiểu số hạng. `AppShell`: mục chính (nhóm + trang cấp 1) `uppercase tracking-wide` ở menu trái và bảng *Thêm*. `MembersPage`: cột *DUPR ID* (ô nhập, lưu khi Enter / bấm ra ngoài, *✓ Đã lưu*), trên điện thoại ô nằm dưới thẻ (≥44px chiều rộng vùng bấm theo ô nhập). `EmailChange` (popup 2 bước: email mới + mật khẩu → mã 6 số) ở Hồ sơ và Tài khoản; bỏ emoji ↩ ở nút Đăng xuất. |
| W – Trang Xếp hạng người chơi (25/10) | xong | `HomeRankings`: khung hạng của bạn (số hạng lớn), `Podium` Top 3 có cúp, danh sách có viền + hàng tiêu đề, mỗi dòng 2 tầng (tên / DUPR · trận · thắng · thua), số xếp hạng bên phải, tách nhóm *Chưa đủ N trận*; giống bảng xếp hạng buổi. |
| X – Trang CLB / Lịch CLB, menu người chơi (25/10) | xong | `/discover/<id>`: tiêu đề + tab *Lịch gần nhất*; popup xin gia nhập 1 câu. `/c/<id>`: nhóm *Hôm nay* thay *Đang diễn ra* (nhãn đỏ chỉ cho buổi đang trong giờ). `PlayerShell`: Trang chủ · Xếp hạng · Tìm kèo / CLB · Hoạt động · Hồ sơ. Xoá tài khoản: ô gõ *delete*. |
| Y – Đăng ký có DUPR ID, email chỉ có mã, ngày dd/mm/yyyy (25/10) | xong | `/sign-in`: tiêu đề *Ra sân thôi!*, ô DUPR ID (không bắt buộc) + link *Hướng dẫn lấy DUPR ID*. `components/DuprIdGuide.js`: link mở `GuideModal` 4 bước, hình sơ đồ `public/guides/dupr-id/step-1..4.svg` (khung điện thoại navy, chỗ cần bấm viền xanh chanh). `components/ui/DateInput.js`: ô ngày gõ dd/mm/yyyy, tự thêm `/`, viền đỏ khi ngày sai; dùng cho ngày sinh ở `/onboarding` và `/p/profile`. Onboarding: bỏ (i) DUPR, thêm dòng giải thích *Họ và tên* khác *tên đăng nhập*. Hồ sơ: chữ mới dưới DUPR ID + link *Xem hướng dẫn chi tiết…*. |
| Z – Ô DUPR ID gọn hơn (25/10) | xong | Bỏ mọi chữ ví dụ DUPR ID (placeholder, lỗi, hình hướng dẫn). Nhãn chỉ *DUPR ID* (không có \* = không bắt buộc). Đăng ký: chú thích *Dùng để cập nhật điểm DUPR và gửi kết quả trận đấu của bạn lên DUPR.* Chào mừng: chỉ còn link *Hướng dẫn lấy DUPR ID*. |
| AA – Hướng dẫn DUPR ID theo app thật, email mã kiểu thẻ (25/10) | xong | `DuprIdGuide`: 2 bước, hình `public/guides/dupr-id/step-1..2.svg` vẽ lại màn *MyDUPR* (nền trắng, nút chia sẻ góc phải có viền xanh chanh) và bảng *Share Profile / Copy DUPR ID* (dữ liệu giả, ID che). Email mã xác nhận: thẻ trắng giữa nền xám, mã 36px giãn chữ trong ô xám, chữ phụ xám, chân thư nhỏ; xem `docs/email-templates/verify-code.html`. |
| AB – Giao diện sáng / tối + trang Hồ sơ mới (25/10) | xong | Mọi màu Tailwind là biến CSS (`web/lib/themeColors.js` → `web/scripts/gen-theme.js` → `web/app/theme.css`); `html[data-theme=light]` đổi: navy → nền trắng xám, chữ xám → đậm, các tông màu nhạt (đỏ/cam/xanh) ↔ đậm, chữ xanh chanh → xanh lá đậm, nút xanh chanh giữ nguyên. `lib/theme.js` + `ThemeSync` (script đầu trang, không nháy); `/` và `/sign-in` luôn tối (`.theme-dark`). `/p/profile`: thẻ tên + các mục 2 cột (tiêu đề trái / nội dung phải), chọn giao diện 3 ô có hình xem trước, icon mới `moon` / `sun` / `monitor`. Đổi màu: sửa `lib/themeColors.js` rồi chạy `node scripts/gen-theme.js`. |
| AC – Logo theo nền (25/10) | xong | `BrandLogo` vẽ cả 2 bản (`/brand/nexuszone-*.svg` xanh chanh, `*-dark.svg` navy), `.logo-on-dark` / `.logo-on-light` trong globals.css chọn bản hợp nền; chú thích Giao diện chỉ còn *Lưu trên thiết bị này.* |
| AD – Ô chống bot ở trang đăng nhập (26/10) | xong | `components/Captcha.js` (Cloudflare Turnstile, `appearance: interaction-only`, nền tối) đặt ngay trên nút gửi của 3 form đăng nhập / đăng ký / quên mật khẩu, chỉ khi có `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; không đổi hiệu ứng trang. |
| AE – Quên mật khẩu bằng mã, email có logo (26/10) | xong | `/sign-in?mode=forgot`: bước 1 gửi mã; bước 2 cùng khung: ô mã 6 số (chữ lớn, giãn, `one-time-code`), mật khẩu mới + nhập lại, nút *Đặt mật khẩu mới*, link *Gửi lại* / *Quay lại đăng nhập*. Email mã (xác nhận + đặt lại mật khẩu) dùng chung một mẫu, đầu thư có logo `public/brand/email-logo.png` (PNG 320×80, bản navy). |
| AF – Đếm ngược gửi lại mã quên mật khẩu (26/10) | xong | Bước nhập mã: nút *Gửi lại mã sau N giây* (xám, `tabular-nums`, vùng bấm 44px) khoá 60 giây; nút *Gửi mã* ở bước 1 cũng khoá khi còn đếm. Server trả `429 code_wait` + `retry_after` → hiện lời báo đợi và đếm đúng số giây còn lại. Chụp 1440px / 390px. |
| AG – Quên mật khẩu bằng link (26/10) | xong | `/sign-in?mode=forgot`: gửi link → khung báo đã gửi + hướng dẫn mở email, nút *Gửi lại sau N giây* (44px), *Quay lại đăng nhập*; bỏ bước nhập mã. `/reset-password?token_hash&k`: form 2 ô mật khẩu, lỗi rõ (link hết hạn → nút gửi link mới), xong → nút *Đăng nhập*. Email: nút navy *Đặt lại mật khẩu* + đường dẫn dự phòng. Chụp 1440px / 390px. |
| AH – Gửi trận lên DUPR: lượt tải + hướng dẫn hình (26/10) | xong | `components/DuprExport.js`: số trận thêm *chờ xác nhận*; nút *Hướng dẫn* (popup `GuideModal` 5 bước, hình `/guides/dupr-upload/step-1..5.svg`, hình DUPR ghi rõ *minh hoạ*); bấm tải khi còn người thiếu ID → popup chọn *Chỉ tải N trận đủ ID* (nút chính, phải) / *Tải cả M trận*; thẻ *Lượt tải chờ xác nhận* (viền xanh dương, *Huỷ lượt này* trái, *Tải lại file* + *Đã tải lên DUPR* phải, vùng bấm 44px); dòng trận trên điện thoại: trạng thái xuống dòng riêng. Chụp 1440px / 390px, không tràn ngang. |
| AI – Bỏ hết ô DUPR tự nhập (26/10) | xong | Bỏ ô *DUPR tự nhập* ở: Thêm thành viên vào kèo, Sửa thông tin người chơi chưa có tài khoản (kèo), Sửa thành viên (pickleball; cầu lông giữ *Cấp độ*), form xin vào CLB qua link khảo sát (pickleball), cột *DUPR tự nhập* ở bảng thành viên và file Excel. Giữ: DUPR ID, điểm DUPR theo ID, Điểm trình (Host chấm), Host nhập tay điểm DUPR ở *Update điểm DUPR*. Chỉ bỏ ô, dữ liệu cũ không xoá. |
| AJ – Bỏ nhập tay điểm DUPR + ô Lấp đầy 7 ngày tới (26/10) | xong | *Update điểm DUPR*: ô điểm đôi / đơn không bấm để nhập được nữa (chưa có điểm hiện *NR*), bỏ dòng *tự khai*, bỏ bước *nhập tay* trong hướng dẫn hình. Lịch kèo (Xé Vé): ô *Lấp đầy 7 ngày tới* chỉ tính kèo 7 ngày tới, dòng phụ *x/y chỗ đã có người · n kèo*, nút (i) giải thích cách tính (`StatTile` nhận `hint`). |
| AK – Xuất ảnh Bảng xếp hạng buổi (26/10) | xong | `lib/standingsImage.js` vẽ ảnh 1080px (canvas, cùng kiểu với ảnh trận đấu): tiêu đề kèo, bục 2·1·3 (vàng/bạc/đồng) trong khung, bảng từ hạng 4 với cột số căn phải `tabular-nums`, dòng xen màu, người cuối tô đỏ nhạt. Nút *Xuất ảnh BXH (.jpg)* (nút phụ, góc phải tiêu đề) trong `EventStandings` khi có `event` (trang kèo của Host). |
| AL – Sửa người chơi trong trận (26/10) | xong | `MatchList`: nút *Sửa trận* (khi có danh sách người chơi) mở popup: *Người chơi* (mỗi đội 1–2 ô chọn, người đã chọn ở ô khác bị mờ) + *Tỷ số*; điện thoại các ô xếp dọc, máy tính 2 ô một hàng. Dùng ở trang kèo Host, trang staff, trận CLB. Chụp 1440px / 390px. |
| AM – Bàn phím số cho ô tỷ số (26/10) | xong | Mọi ô tỷ số (nhập trận, sửa trận, ván cầu lông / thể thức tự đặt, nhập kết quả giải, xếp sân, số phút trận) dùng `type="text" inputMode="numeric" pattern="[0-9]*"` (`lib/digits.js` NUMPAD) → điện thoại hiện bàn phím chỉ có 0–9; chữ / dấu gõ hoặc dán vào bị bỏ, tối đa 2 chữ số (phút: 3). |
| AN – DUPR: xử lý bấm nhầm / mất file (26/10) | xong | Hộp hỏi lại trước *Đã tải lên DUPR*; mục *Lịch sử lượt tải (N)* (bấm mở) — thẻ viền xám: giờ tải, trạng thái *Đã tải lên DUPR · giờ* (xanh) / *Đã huỷ · giờ*, *Xem N trận trong file*, nút *Tải lại file* + *Chưa tải thật? Mở lại* / *Đã tải thật? Mở lại* (phải); thẻ chờ xác nhận cũng có *Xem N trận trong file*; popup Sửa trận có khung vàng khi trận đã gửi DUPR. Chụp 1440px / 390px. |
| AO – Gửi trận lên DUPR dạng tab như Reclub (26/10) | xong | `DuprExport`: 4 tab đếm trận (chờ gửi · chờ xác nhận · đã gửi · không đủ điều kiện, ô viền xanh khi chọn, 2×2 trên điện thoại); thẻ trận (chữ cái đầu, tên 2 đội, tỷ số từng ván ở giữa, đội thắng sáng, người thiếu ID tô vàng); tab chờ gửi chọn trận bằng cách bấm thẻ + Chọn tất cả, nút chính rộng ở dưới; tab không đủ điều kiện ghi lý do từng trận; bỏ popup chọn trận cũ. Hình hướng dẫn bước 2 vẽ lại. Chụp 1440px / 390px. |
| AP – Hoàn tác dễ thấy + khoá trận đã gửi DUPR (26/10) | xong | Sau khi xác nhận: khung xanh thông báo + nút *Hoàn tác*; tab *đã gửi*: thẻ từng lần gửi (viền xanh, *đã khoá*) với *Tải lại file* + *Hoàn tác*; lượt huỷ nằm ở *Lượt tải đã huỷ*. Thẻ trận đã gửi (kèo / CLB) thay nút Sửa / Xoá bằng dòng *Đã gửi lên DUPR · đã khoá…*. Chụp 1440px / 390px. |
| AQ – Ô nút / tab đều nhau + rà UI điện thoại (26/10) | xong | `components/ui/ActionRow.js`: hàng 2–4 nút chính (Tổng quan, Tổng quan cộng đồng, trang kèo: *Thêm thành viên · Điểm danh · Gửi link*) — điện thoại: ô bằng nhau, biểu tượng trên, chữ trong khung cố định 2 dòng (chữ 1 dòng không bị tụt); máy tính: nút tròn bên phải. Tab chính trang kèo / trang kèo công khai: số đếm thành viên tròn, ô cao đều `min-h-[3.5rem]`; `SectionTabs` + menu dưới điện thoại: biểu tượng ghim trên, chữ cùng dòng. Hàng tab gạch chân (`UnderlineTabs`): khi còn tab khuất, mép phải / trái mờ dần + mũi tên bấm được để cuộn, chữ bị cắt không còn trông như lỗi. Trận đấu CLB: nút *+* thành **+ Thêm trận**. Tài khoản → Thông tin: nút *Lưu* sang phải, link đổi mật khẩu bên trái. Chụp 390px toàn bộ 24 trang Host / cộng đồng / người chơi. |
| AR – Trang Tài khoản: mục thành hàng tab lướt ngang (26/10) | xong | 8 nút tròn xếp 4 dòng trên điện thoại thay bằng **một hàng tab gạch chân** (`UnderlineTabs`): vuốt ngang, mép mờ + mũi tên khi còn tab khuất, tab *Bảo mật & xóa tài khoản* màu đỏ (`tone: 'danger'`), mở theo `#hash` như cũ. Chụp 390px. |
| AS – Rà giao diện các vai trò khác (26/10) | xong | Chụp 390px + 1440px cho Điều phối viên, Trọng tài, Co-Admin, Tài chính, Vận hành, Owner, khách chưa đăng nhập (44 ảnh, không tràn ngang). Sửa: trang sự kiện của nhân viên bỏ nút *← Quay lại* trùng với *← Sự kiện của tôi*; bộ lọc điểm danh (*Chưa đến · Đã đến · Vắng · Tất cả*) trên điện thoại xếp 2×2 đều nhau (`Segmented phoneCols`); menu dưới của nhân viên / Tài chính có thêm *Tài khoản* (không còn 1 ô lẻ cạnh *Thêm*); người được mời làm Co-Admin / nhân viên nhưng chưa xác nhận email thấy lời nhắc vàng ngay trên khung *Tạo CLB đầu tiên*. |
| AT – Hàng nút lọc lướt ngang + 5 bổ sung theo vai trò (26/10) | xong | `components/ui/ChipRow.js` + `lib/useScrollEdges.js`: mọi hàng nút lọc / tab dạng viên (Tài chính: Tổng quan · Sổ thu chi · Gói hội viên · Kho bóng; Lịch sự kiện: chip CLB + Tất cả / Đang diễn ra / Sắp diễn ra / Đang mở / Đã xong; Thành viên: lọc giới tính / hình thức / sắp xếp / cột; Update điểm DUPR; Sổ thu chi: Lọc tháng / hạng mục / nguồn; Thống kê nâng cao; Phân quyền; Owner: Host, Thanh toán, Duyệt CLB, Chuyển giao, Hoạt động, Góp ý, CLB, Hỗ trợ; chọn số tháng gói, lý do huỷ nhanh, cờ thành viên, loại góp ý, phiếu họp) — điện thoại: **một hàng lướt ngang**, mép mờ + mũi tên khi còn khuất; máy tính: xuống dòng như cũ. `Segmented` cũng lướt ngang trên điện thoại. Bổ sung: nhân viên có *Tài khoản* ở sidebar + nút **Hướng dẫn nhanh** (popup 3 bước); ô tìm tên ở trang sự kiện nhân viên to hơn (48px, biểu tượng kính lúp, nút ×); vai trò Tài chính không thấy thanh sinh nhật; Owner → Host: ô tìm + lọc dính đầu màn hình khi cuộn; khách chưa đăng nhập mở `/c/<id>` được đưa sang trang CLB công khai `/discover/<id>` thay vì màn đăng nhập. |
| AU – Xếp hạng & cộng đồng: 8 chỉnh sửa (26/10) | xong | Tỉ lệ thắng làm tròn số nguyên ở mọi bảng; bảng xếp hạng nhận cả người ngoài danh sách (nhãn *Khách* / *Thành viên*, gộp theo DUPR ID); *Số tuần giữ Top 1* tính theo đúng luật bảng (tỉ lệ thắng + đủ số trận tối thiểu trong tuần); bỏ hẳn *Top tháng* (menu, trang, Bảng điều khiển, voucher, trang người chơi); thanh sinh nhật chỉ ở trang Thành viên; chữ Bảng điều khiển ngắn gọn; *Tạm nghỉ* (chấn thương / đi xa / bận / khác) ở Sửa thành viên → không bị tự chuyển xuống vãng lai, mốc 'không chơi' = số ngày ở mục Hoạt động; mọi bảng xếp hạng dùng `rank-table` kẻ ô đầy đủ. Chụp 1440px / 390px. |
| AV – Tài chính: một số dư; Tài khoản nhân viên (27/10) | xong | Tổng quan tài chính: ô *Số dư quỹ* = tổng quỹ CLB + các buổi, dòng phụ *Quỹ CLB … · Các buổi …*. Sổ thu chi: dòng số dư cùng cách gọi. (*Tính từ ngày* đã bỏ theo yêu cầu, thay bằng sửa / huỷ từng khoản — AW.) Trang Tài khoản của tài khoản chỉ là nhân viên bỏ 3 mục Host. Chụp 1440px / 390px. |
| AW – Sổ thu chi: sửa / huỷ cả khoản tự động (27/10) | xong | Mọi dòng có ✎ và ✕. Popup Sửa cho khoản tự động: khung xanh *Thu · Phí kèo* + giải thích ngắn, chỉ 3 ô Số tiền / Ngày / Ghi chú. Hủy khoản tự động = không tính tiền, người chơi vẫn đã thu. Chụp 1440px. |
| AX – Bỏ *Tính từ ngày*; Sổ thu chi gộp theo buổi (27/10) | xong | Bỏ hẳn nút / cột *Tính từ ngày* (migration finance_from xoá). Tab *Chi tiết*: bảng Thu và Chi chia nhóm theo buổi, tiêu đề nhóm = link buổi · số khoản · tổng buổi; nhóm *Không gắn buổi (quỹ CLB)* cuối bảng; ô ghi chú không lặp lại tên buổi. Chụp 1440px / 390px. |
| AY – Sổ thu chi: Thu / Chi cạnh nhau, thẳng hàng theo buổi (27/10) | xong | Một bảng chung thay 2 thẻ xếp dọc: đầu bảng 2 cột *Thu (n) · tổng* / *Chi (n) · tổng*; mỗi buổi một hàng tiêu đề kéo ngang 2 cột (link buổi · số khoản · +thu −chi); dưới là khoản thu (trái) và khoản chi (phải) của buổi, bên trống ghi "—"; nhóm quỹ CLB cuối. Điện thoại: dưới mỗi tiêu đề là Thu rồi Chi, có dòng tổng nhỏ. Chụp 1440px / 390px. |
| AZ – Sổ thu chi: ô tick *Không tính* thay nút Hủy ở khoản tự động (27/10) | xong | Mỗi dòng (sổ + tab Tài chính của kèo) có ô tick *Không tính*; tick → nhãn vàng *không tính*, số tiền gạch mờ, không cộng vào tổng cột / tổng buổi / số dư / Tổng quan / Excel. Popup Sửa có ô tick cùng giải thích; khoản tự động không còn ✕, khoản nhập tay vẫn có. Chụp 1440px / 390px. |
| BA – Xếp hạng người chơi: cột thẳng hàng (27/10) | xong | HomeRankings (trang Xếp hạng + trang chủ người chơi) đổi từ danh sách flex sang bảng `rank-table` 3 cột (# w-10 · Họ tên · số w-20): đường kẻ dọc thẳng từ trên xuống, tên và dòng DUPR tách 2 dòng, hàng của mình nền xanh. Chụp 1440px / 390px. |
| BB – Menu người chơi: "Tìm kèo / CLB" → "Tìm" (29/10) | xong | Nhãn thanh điều hướng người chơi (dưới điện thoại + trên máy tính) rút thành *Tìm* / *Find*; tiêu đề trang `/discover` giữ nguyên. Chuẩn bị thêm tab Coach vào trang này. |
| BC – Khảo sát sau buổi: nút × Không đánh giá (29/10) | xong | Thẻ *Đánh giá buổi chơi* ở `/home` và `/p` có nút × (44px); trang `/s/<token>` có dòng *✕ Không đánh giá* → khung "Bạn đã bỏ qua…" + *Đánh giá ngay*. Lưu `survey_skipped_at`; lời nhắc ẩn ở mọi trang. Chụp 390px. |
| BD – Coach Manager đợt C1 (29/10) | xong | Không gian `coach` (menu Tổng quan · Hồ sơ Coach · Tài khoản; menu dưới 2 ô + Tài khoản), ô Coach + thẻ mời ở `/home`, mục Coach trong bộ chuyển ngữ cảnh, thẻ thứ ba ở màn chọn kind; `/coach` (4 ô số *Sắp có*, thẻ hồ sơ, Việc tiếp theo), `/coach/profile` (4 khối, popup (i), Sao chép link), `/coach/<slug>` công khai (PlayerShell). Công tắc `coach_enabled` ở Owner → Hệ thống. Chụp 1440px / 390px. |
| BE – Coach Manager đợt C2 + quên mật khẩu hiện email (29/10) | xong | Menu Coach: Tổng quan · Lịch dạy · Lớp học · Gói buổi · Hồ sơ Coach · Tài khoản (menu dưới 4 ô + Thêm). `/coach/packages` thẻ gói + Modal; `/coach/classes` chips lọc + thẻ lớp; `/coach/classes/new` form 4 khối, 7 nút thứ (44px), ô xem trước *Sẽ tạo N buổi*; `/coach/classes/<id>` UnderlineTabs Buổi · Học viên · Cài đặt, dòng buổi có Dời / Huỷ, Modal dời; `/coach/schedule` tuần 7 ngày; `/coach/sessions/<id>`; tổng quan có Buổi dạy sắp tới; trang công khai có Gói buổi + Lớp học. Màn quên mật khẩu ghi rõ email đã nhập. Chụp 1440px / 390px. |
| BF – Coach Manager đợt C3 + Lịch dạy nhiều chế độ xem (29/10) | xong | `/coach/schedule` dùng lại `EventCalendar` của CLB: Danh sách · Năm · Tháng · Tuần · Ngày (Segmented, ‹ › Hôm nay, DatePopover; nhãn *N buổi* qua prop `labels`). Menu Coach thêm **Học viên** (menu dưới: Tổng quan · Lịch dạy · Lớp học · Học viên · Thêm). `/coach/students` tabs Chờ duyệt · Tất cả · Đang học · Đã nghỉ · Đã chặn + tìm + Modal học viên (sửa, trạng thái, lớp đã đăng ký); tab Học viên của trang lớp (chip *Đã nhận x / N*, `EnrollActions` Nhận / Chờ / Gỡ / Nhận lại, Modal thêm vào lớp). Trang công khai: nút **Đăng ký** mỗi lớp → Modal (đã đăng nhập: 1 nút; chưa: tên + sđt + cách trả + Turnstile → link `/coach/r/<mã>`). Trang `/coach/r/<mã>` (PlayerShell). `/p` thêm khối *Lớp học của tôi*. Chụp 1440px / 390px. |
| BG – Coach Manager đợt C4: điểm danh + QR + gói buổi (29/10) | xong | `/coach/sessions/<id>`: khối *Học viên của buổi* (đếm Có mặt / Vắng / Báo nghỉ, quy định trừ buổi), mỗi dòng `StudentLine` + `BalanceChip` (*Còn N buổi* / *Chưa có gói* / *Đã trừ 1 buổi*) + chip phí (bấm đổi đã thu) + nhóm 3 nút 44px Có mặt / Vắng / Báo nghỉ (màu chanh / đỏ / xanh khi chọn); nút *Quét QR* mở `QrScanner` với nhật ký quét; nút chính *Hoàn tất buổi*. Popup học viên: `PurchasesPanel` (+ Thêm gói: chọn gói / tự nhập, đã thu) và `HistoryList` (−1). Lịch dạy → Danh sách: khung vàng *Buổi đã qua chưa điểm danh*; Tổng quan: khung *Cần làm*. Phía học viên (`MySessions` ở `/p` và `/coach/r/<mã>`): còn N buổi, đếm điểm danh, từng buổi sắp tới với *Tôi không đi được* / *Tôi đi được* (vàng khi quá hạn). Chụp 1440px / 390px. |
| BH – Coach Manager đợt C5: tiền + Hồ sơ đổi thứ tự (30/10) | xong | Menu Coach thêm **Tiền** (`/coach/money`, UnderlineTabs *Chờ xác nhận* (số + chấm đỏ khi có ảnh) · *Sổ thu chi* · *Nhận tiền*): dòng đơn gói với nhãn trạng thái, *Xem ảnh* (Modal ảnh + Từ chối / Xác nhận tiền), nút chính bên phải; phí chưa thu *Miễn* / *Đã thu*; sổ theo tháng với 3 `StatTile`, số căn phải `tabular-nums`, tick *Không tính*, *Huỷ*, Modal *+ Thêm khoản*, *Xuất Excel*; *Nhận tiền* dùng lại `HostPaymentSettings` (prop `endpoint`). `CoachBuy` (học viên): đơn chờ hiện `PaymentCard` VietQR + nút gửi ảnh, gói đang dùng / đã hoàn, gói đang bán với *Mua gói*. Trang công khai: nút *Mua gói* ở từng gói. Popup học viên: *Hoàn tiền*. Tổng quan: dải *Tháng này Thu · Chi · Còn lại*. `/p/profile`: mục **Tài khoản** chuyển xuống cuối trang; chú thích (i) *Mã điểm danh của tôi* ghi rõ dùng cho CLB / cộng đồng và lớp Coach. Chụp 1440px / 390px. |
| BI – Coach Manager đợt C6–C8 (30/10) | xong | Owner → **Coach** (bảng 7 cột trên máy tính, 2 dòng trên điện thoại, chip lọc, Khoá / Mở khoá bên phải, popup báo cáo + đánh giá; badge số báo cáo ở menu; 4 ô ở Tổng quan). Menu Coach thêm **Lịch rảnh** (`/coach/hours`: yêu cầu 1-1 với *Từ chối* / *Nhận* bên phải, khung giờ hằng tuần, cột phải buổi đã nhận + chip giờ trống; Modal 7 nút thứ 44px) và **Thống kê** (`/coach/stats`: Segmented 3/6/12 tháng, 4 `StatTile`, bảng tháng có thanh thu, lớp dạy nhiều nhất). Popup học viên: `NotesPanel`. Hồ sơ Coach: *Đánh giá* + *Trợ giảng*. Trang công khai: dòng ★ dưới tên, khung *Đặt kèm 1-1* (chip ngày cuộn ngang, nút giờ 44px, Modal xác nhận), *Đánh giá* + Modal sao, link *Báo cáo hồ sơ này*. `/discover` tab **Coach** (`CoachFind`). `/p`: thẻ *Bạn là trợ giảng*, *Buổi kèm 1-1 của tôi*, *Ghi chú của huấn luyện viên*. `/assist` + trang buổi trợ giảng. Bỏ các chữ *(đợt sau)* còn sót. Chụp 1440px / 390px. |
| BJ – Coach ↔ CLB liên kết + Thay người DUPR (30/10) | xong | `/coach/clubs` (Coach: lời mời, CLB của tôi với chip trạng thái, danh sách thành viên có ô tìm + *Thêm làm học viên* 44px, popup tìm CLB), `/club/coaches` (Host: Coach xin liên kết / Đang liên kết / Lời mời đã gửi, khối *Học viên của …* bảng 5 cột trên máy tính, 2 dòng trên điện thoại, số căn phải, trống là —). Khối *Gửi trận lên DUPR* → tab không đủ điều kiện: link *Thay người* mở popup chọn người cần thay / người thay vào + số trận sẽ đổi. Chụp 1440px + 390px. |
| BK – DUPR: lượt đã tải thành mục riêng (29/10) | xong | Tab *đã gửi*: thẻ trận lên đầu; các lượt tải đã xác nhận chuyển xuống mục gập **Lượt đã tải (N)** (cùng kiểu với *Lượt tải đã huỷ*, viền xanh chanh, nút Tải lại file / Hoàn tác cả lượt bên phải, *Xem N trận trong file*). Chụp 1440px + 390px. |
| BL – Người chơi: Tổng quan 2 cột, Hoạt động = trận đấu, Cài đặt, nút sáng/tối (29/10) | xong | Menu: Tổng quan · Xếp hạng · Không gian · Tìm · Hoạt động · Cài đặt (thanh dưới 6 ô). `/p` 2 cột trên máy tính (trái: mã điểm danh, 4 ô số, đánh giá, CLB; phải: DUPR + phong độ). `/p/activity`: hàng lọc (ở đâu, kết quả, sắp xếp, từ–đến, tên) + thẻ trận gộp theo tháng (2 cột máy tính), tab Buổi tham gia. `ThemeToggle` (40px) cạnh chuông ở shell người chơi và quản lý. Chụp 1440px + 390px, cả giao diện sáng. |
| BM – Sinh nhật trong tháng + Tặng quà (29/10) | xong | Khung Sinh nhật ở Tổng quan: số người + *Xem tất cả »*. `/club/birthdays`: điều hướng tháng ‹ ›, bảng 11 cột trên máy tính (ô chọn 44px, số căn phải, trống là —), 2–3 dòng trên điện thoại; nút *Tặng quà (N)* bên phải; popup chọn loại quà (thẻ radio 48px), lời chúc, hạn dùng. Người chơi: khung *Quà sinh nhật của tôi* (viền hồng) ở Tổng quan. Sidebar quản lý: ngôn ngữ thành hàng riêng, hàng dưới chuông · sáng/tối · đăng xuất. Chụp 1440px + 390px. |
| BN – Quyền đồng quản trị (co-host) mới (29/10) | xong | Menu co-host ẩn Tài chính (chỉ còn Kho bóng), Bảng điều khiển cộng đồng, Phân quyền; thanh dưới *Tài chính* → *Quản lý kho bóng*; Tổng quan không có khối tiền / công nợ; tab Tài chính của kèo ẩn (lưới 3 tab); khối Gửi trận lên DUPR ẩn; nút xoá / loại thành viên ẩn. Trang bị chặn: thẻ *Trang này chỉ dành cho Host* + *Về Tổng quan*. Kèo chờ duyệt: nhãn vàng trong danh sách, khung vàng trên trang kèo (chủ: *Từ chối* / *Duyệt kèo* bên phải). Bảng *Quyền của từng vai trò* 13 dòng. Chụp 1440px + 390px. |
| BO – Tiền thực tế & hoàn phí từng người (29/10) | xong | Bảng người chơi: khối **Tiền buổi chơi** (viền xám, tiêu đề + (i)) — chip trạng thái bên phải; 3 dòng số căn phải `tabular-nums` (*Theo bảng giá · Đã thanh toán* (dòng phụ: ban đầu + thu thêm − hoàn) · *Thực tế phải trả* (ô số, nút *Lưu* hiện khi đổi)); ô *Lý do*; khung chênh lệch (*Cần thu thêm / Cần hoàn lại / Chưa thanh toán* + ô số tiền + nút chính *Đã thu thêm* / *Đã hoàn phí* bên phải); lịch sử (giờ · nội dung · lý do; dòng đã hoàn tác gạch ngang, nút *Hoàn tác* 44px trên điện thoại); "—" xám khi chưa trả; đang tải = khối mờ. Tab Tài chính: bảng **Điều chỉnh tiền & hoàn phí** (6 cột trên máy tính, 2 dòng trên điện thoại, tổng *Cần thu thêm* / *Cần hoàn* ở đầu, trạng thái trống có hướng dẫn); bấm tên mở người chơi. Chụp 390 + 1440px: không tràn ngang. |
| BP – Số tuần giữ Top 1 tính theo bảng tích luỹ (29/10) | xong | Logic mới (giữ ngôi đến khi bị vượt trên bảng mọi trận); khung giữ nguyên bố cục, dòng phụ người đang giữ đổi thành *Giữ từ dd/mm/yyyy*, người khác *Lần giữ dài nhất N tuần*; chữ giải thích cập nhật. Chỉ đổi chữ, không đổi bố cục. |
| BQ – Hàng tab nhóm menu vuốt ngang trên điện thoại (29/10) | xong | `SectionTabs`: điện thoại bỏ lưới 3 cột xuống dòng → một hàng `overflow-x-auto` (ô 6.75rem khi ≥4 tab, chia đều khi 2–3 tab), tab đang mở tự cuộn vào giữa, `EdgeArrow` hai mép. Sửa lỗi chung: `tailwind.config.js` thêm `./lib/**` vào `content` — class của `EdgeArrow` (lib/useScrollEdges.js) trước đây không được tạo nên mũi tên mọi hàng vuốt ngang bị lệch xuống dưới. Chụp 390 + 1440px, không tràn ngang. |
| BR – Khảo sát bản 3, link & QR, Hoạt động chia mục, BXH trình độ tách điểm tự nhập, menu Cộng đồng (30/10) | xong | Trang `/s/<token>`: 5 câu mới (sao + 3 hàng nút 44px, câu 3 có nút dài chiếm cả hàng), dòng *Khảo sát mở đến …*. Trang mới `/s/e/<mã>`: danh sách tên người đã chơi (dòng 52px, *Đã gửi* xám), ô tìm khi > 8 người, trạng thái chưa mở / đã đóng. Khối đánh giá ở trang kèo: nút chính *Link & QR khảo sát* → popup QR (tải ảnh), ô link + Sao chép. `/club/reviews`: khung *Thời hạn khảo sát* (2 nút tròn), ô % hài lòng tổ chức / % trận cân bằng, 4 thanh tỉ lệ. `/p/activity` tab Buổi tham gia: 2 mục *Sắp diễn ra* / *Đã diễn ra* có số đếm, trống thì ghi rõ. `/rankings` xếp theo trình độ: mục riêng *Điểm tự nhập — chưa xác thực DUPR* (i) + nhãn *Tự nhập*. Menu người chơi: *Không gian* → *Cộng đồng*. Chụp 390 + 1440px bằng dữ liệu giả lập, không tràn ngang. |
| BS – Bỏ nút Tạo cộng đồng mới ở Tổng quan cộng đồng; Đồng quản trị / Co-admin → Co-host (30/10) | xong | `CommunityOverview`: bỏ ô viền đứt *＋ Tạo cộng đồng mới* cuối dải tab; dải tab chỉ hiện khi có ≥ 2 cộng đồng. i18n vi + en: mọi nhãn vai trò *Đồng quản trị* / *Co-admin* thành **Co-host** (chip trong danh sách thành viên, banner, Phân quyền, nhật ký…). Không đổi bố cục. |
| BT – Ghi chú nhanh tự đặt cho thành viên (30/10) | xong | `MemberDetail`: dưới 3 cờ có sẵn là các ghi chú tự đặt (chip xanh dương, ✓ + ×), ô *Ghi chú nhanh* + nút *+ Thêm* (≤ 6, ≤ 30 ký tự); ô *Ghi chú chi tiết* giữ nguyên. `MembersPage`: ghi chú tự đặt hiện cạnh tên như các cờ (`flagStyle` / `flagLabel`). Không đổi bố cục. |
| BU – Thành viên: Thêm tay, Tải lên DS, Hoàn tác xoá, Chuyển cộng đồng; BXH theo nhóm Bảng điều khiển (30/10) | xong | Đầu trang Thành viên: *Xuất Excel · Tải lên DS · + Thêm thành viên · Bảng điều khiển · Link mời* (nút chính bên phải). Popup Thêm thành viên (2 cột máy tính, 1 cột điện thoại, nút hình thức 44px, khung vàng khi trùng + *Mở người này*). Popup Tải lên DS: *Tải file mẫu* + *Chọn file .xlsx*, 3 ô đếm (thêm / cập nhật / bỏ qua), danh sách dòng cuộn được, nút *Nhập N dòng*. Thanh *Hoàn tác* nổi ở đáy (trên menu dưới điện thoại), đếm ngược 10 giây. Bảng chi tiết thành viên: khối *Chuyển sang cộng đồng khác* (i). `/rankings`: nút *Nhóm* trong *Xếp theo*, mỗi nhóm một bảng; dòng phụ chỉ còn trận · thắng · thua. Chụp 390 + 1440px bằng dữ liệu giả lập, không tràn ngang. |
| BV – BXH: "Chia theo nhóm" là nút bật/tắt, giữ cách xếp Tỉ lệ thắng / Trình độ DUPR (30/10) | xong | `HomeRankings`: bỏ lựa chọn *Nhóm* trong *Xếp theo*; thêm nút ✓ *Chia theo nhóm* riêng. Bật → mỗi nhóm Bảng điều khiển một bảng, trong nhóm xếp theo tỉ lệ thắng hoặc DUPR (điểm tự nhập xếp sau, nhãn *Tự nhập*). Chụp 390 + 1440px giả lập. |
