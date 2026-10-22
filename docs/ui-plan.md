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
| 8 – Trang giới thiệu và đăng nhập | xong | Bỏ `lp-sheen-text`, `lp-btn-glow`, `lp-blob`, `lp-glow`, `lp-ghost`, `lp-sweep`, `lp-cursor` (CSS + JSX + dữ liệu `glow`, `Aurora` rỗng, `Cursor`); nhãn trên tiêu đề (Eyebrow, hero, sign-in) bỏ số thứ tự / IN HOA giãn / viên thuốc; bỏ số cảnh và số thứ tự ở mục lục, bước; khung minh hoạ nền đặc, bỏ bóng, kính mờ; 4 chỗ cắt chữ → xuống dòng; nhãn 10px IN HOA → 12–14px chữ thường; điện thoại: cảnh không còn cao 100svh; Điều khoản/Bảo mật khung `max-w-2xl`. Font: trang giới thiệu đã cùng Plus Jakarta Sans với app từ Đợt 1. Chưa làm: chưa chạy `inspect.mjs`/chụp ảnh; vẫn giữ sân 3D và chuyển cảnh (không bị cấm) |
