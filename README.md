# 🏓 Quản Lý Pickleball — Pickleball Manager

Web app quản lý **câu lạc bộ pickleball** và **kèo lẻ (Xé Vé)** cho người tổ chức (Host). Người chơi dùng chung app để tự đăng ký kèo, tham gia CLB và thanh toán. Trọng tài và điều phối viên cũng dùng chung app để check-in và nhập tỷ số.

- Giao diện tiếng Việt (có tiếng Anh), tông navy/xanh chanh.
- Chạy tốt trên điện thoại (thanh menu dưới) và máy tính (menu bên trái).
- Một tài khoản quản lý được **nhiều CLB**.

---

## Mục lục

1. [App dùng để làm gì?](#1-app-dùng-để-làm-gì)
2. [Kiến trúc](#2-kiến-trúc)
3. [Bốn không gian làm việc](#3-bốn-không-gian-làm-việc)
4. [Tính năng chi tiết — Club Manager](#4-tính-năng-chi-tiết--club-manager)
5. [Tính năng chi tiết — Xé Vé Manager](#5-tính-năng-chi-tiết--xé-vé-manager)
6. [Phân quyền: Trọng tài, Điều phối viên, Đồng quản trị](#6-phân-quyền-trọng-tài-điều-phối-viên-đồng-quản-trị)
7. [Cổng người chơi](#7-cổng-người-chơi)
8. [Tính năng chung](#8-tính-năng-chung)
9. [Hướng dẫn nhanh theo tình huống](#9-hướng-dẫn-nhanh-theo-tình-huống)
10. [Cài đặt & chạy trên máy](#10-cài-đặt--chạy-trên-máy)
11. [Deploy lên Supabase + Render + Vercel](#11-deploy-lên-supabase--render--vercel)
12. [Biến môi trường](#12-biến-môi-trường)
13. [Góp ý → email của bạn](#13-góp-ý--email-của-bạn)
14. [Cấu trúc thư mục](#14-cấu-trúc-thư-mục)
15. [API](#15-api)
16. [Cơ sở dữ liệu](#16-cơ-sở-dữ-liệu)
17. [Nguyên tắc dữ liệu & bảo mật](#17-nguyên-tắc-dữ-liệu--bảo-mật)
18. [Xử lý sự cố](#18-xử-lý-sự-cố)

---

## 1. App dùng để làm gì?

| Bạn là… | App giúp bạn… |
|---|---|
| **Chủ nhiệm CLB** | Quản lý thành viên, bán gói tháng/quý/năm và trừ buổi tự động khi check-in. Xếp lịch chơi định kỳ trên lịch tháng/tuần/ngày, nhập trận đấu, xếp hạng và vinh danh, tổ chức giải nội bộ, quản lý quỹ, kho bóng và thống kê. |
| **Người mở kèo lẻ (Xé Vé)** | Tạo kèo và gửi link đăng ký vào nhóm Zalo/Telegram. App tự xếp danh sách chính / danh sách chờ, tự đẩy người chờ lên khi có người huỷ và nhắn tin báo họ. Áp dụng hạn chót huỷ kèo, check-in bằng quét QR, đánh dấu vắng, thu phí, tính lãi/lỗ từng kèo và xuất Excel. |
| **Trọng tài / điều phối viên** | Đăng nhập bằng tài khoản riêng để check-in người chơi (bấm tay hoặc quét QR) và nhập tỷ số của các kèo được giao. Không thấy tài chính hay số điện thoại. |
| **Đồng quản trị (người cùng góp vốn)** | Dùng email riêng để cùng xem và quản lý Thành viên + Tài chính của một CLB. Không xoá được CLB. |
| **Người chơi** | Đăng nhập rồi đăng ký kèo qua link, chuyển khoản và gửi ảnh xác nhận, nhận vé QR check-in, chuyển nhượng slot cho bạn, tự huỷ kèo, tham gia CLB, nhận tin Telegram khi được lên danh sách chính. Xem số buổi còn lại, công nợ, lịch sử tham gia, phong độ và biến động DUPR. |

---

## 2. Kiến trúc

```
 Trình duyệt (điện thoại / máy tính)
        │
        ▼
 web/  — Next.js 14 (App Router, Tailwind, Recharts)      → deploy Vercel
        │   • đăng nhập trực tiếp với Supabase Auth
        │   • mọi dữ liệu khác đi qua API ↓ (Bearer token)
        ▼
 backend/ — Express API (Node 18+)                        → deploy Render
        │   • kiểm tra token, gắn host_id, áp giới hạn gói
        │   • dùng service role key, luôn lọc theo host_id
        ▼
 database/schema.sql — Supabase (PostgreSQL + PostgREST)
        • bảng, view, trigger (lịch sử SCD2, sổ thu chi không sửa được), RLS
```

- **Frontend:** Next.js 14, React 18, Tailwind CSS, Recharts (biểu đồ), SheetJS (xuất Excel), Supabase JS (auth).
- **Backend:** Express 4, `@supabase/supabase-js`, `dotenv`, `cors`. Không cần build.
- **Database:** PostgreSQL trên Supabase. Toàn bộ schema nằm trong **một file**, chạy lại nhiều lần vẫn an toàn (idempotent).
- **Múi giờ:** mặc định `Asia/Ho_Chi_Minh` (biến `APP_TZ`). Dùng để tính "hôm nay", kỳ xếp hạng và tháng thống kê.

---

## 3. Bốn không gian làm việc

Sau khi đăng nhập, bạn chọn **không gian làm việc** (workspace). Có thể đổi bất cứ lúc nào ở đầu menu.

| Workspace | Dành cho | Menu |
|---|---|---|
| **Club Manager** | Cộng đồng chơi lâu dài | Tổng quan · Thành viên · **Tạo hoạt động ▸** (Lịch sự kiện, Tạo lịch chơi hàng tuần, Tạo giải đấu, Tạo kèo) · **Thống kê ▸** (Bảng xếp hạng, Trận đấu, Phân tích) · **Tài chính ▸** (Tổng quan, Sổ thu chi, Gói hội viên, Kho bóng) · **Cài đặt ▸** (CLB của tôi, Phân quyền, Tài khoản) |
| **Xé Vé Manager** | Kèo lẻ, giải phong trào | Kèo Xé Vé · Thống kê · **Tài chính ▸** (Tổng quan, Sổ thu chi) · **Cài đặt ▸** (Phân quyền, Tài khoản) |
| **Trọng tài / Điều phối** | Người được Host giao việc | Kèo được giao |
| **Tôi là người chơi** | Người chơi | Của tôi · Hồ sơ |

**Menu:**
- Trên máy tính, menu bên trái chia theo **nhóm (segment)**. Mỗi nhóm thu gọn/mở rộng được, app nhớ trạng thái. Nhóm chứa trang đang mở tự bung ra.
- Nút mũi tên thu menu lại thành dải icon.
- Trên điện thoại có thanh dưới: *Tổng quan · Thành viên · Lịch · Tài chính · Thêm*. Nút **Thêm** mở toàn bộ menu theo nhóm.

**Đồng quản trị** của CLB người khác (xem [6.4](#64-người-được-cấp-quyền-đồng-quản-trị)): khi chọn CLB được chia sẻ trong workspace Club, menu chỉ còn *Thành viên · Tài chính ▸ · Cài đặt ▸*.

Club và Xé Vé tách dữ liệu rõ ràng:
- **Club:** các buổi (event) gắn với CLB đang chọn.
- **Xé Vé:** các kèo không thuộc CLB nào.

---

## 4. Tính năng chi tiết — Club Manager

### 4.1. CLB của tôi (`/clubs`)
- Tạo, đổi tên, xoá CLB. Một tài khoản có thể quản lý nhiều CLB.
- Chọn **CLB hiện tại** bằng bộ chuyển CLB. Mọi trang Club hiển thị dữ liệu của CLB đang chọn.
- Xoá CLB sẽ xoá toàn bộ thành viên, gói hội viên và quỹ của CLB đó (app hỏi xác nhận trước).
- Phần **Thanh toán & link tham gia** (xem [4.12](#412-link-tham-gia-clb--thanh-toán-vietqr)).

### 4.2. Tổng quan (`/dashboard`)
Tóm tắt CLB đang chọn và các buổi sắp tới, kèm lối tắt tạo buổi mới và quản lý CLB.

### 4.3. Thành viên (`/club/members`)

**Bảng thành viên:**
- Có kẻ ô ngang/dọc.
- Các cột: **STT · Họ tên · Giới tính · Năm sinh · DUPR · Loại · Hạng**, cùng trạng thái gói và số buổi còn lại.
- Loại: *Cố định* hoặc *Vãng lai/Giao lưu*.
- Hạng: *VIP* hoặc *Thường*. Chỉ thành viên cố định mới có hạng.

**Thêm và xoá:**
- Nút **＋** mở popup thêm thành viên.
- Nút **Xoá** nằm cạnh: tick chọn nhiều người, bấm xoá, rồi **xác nhận** (liệt kê tên từng người) để tránh bấm nhầm. Xoá thành viên cũng xoá lịch sử trận đấu và gói hội viên của họ.

**Bấm vào tên để mở chi tiết thành viên:**
- **✏️ Sửa thông tin** (nút ✏️ ngay cạnh tên trong bảng, hoặc trong chi tiết): họ tên, SĐT, giới tính, DUPR, ngày sinh, loại, hạng, tháng vào CLB, đang hoạt động hay không.
- **Gói hội viên** của người đó: đăng ký gói, đánh dấu đã đóng/chưa đóng, trừ hoặc hoàn buổi thủ công.
- **Ghi chú nội bộ** (chỉ Host thấy): cờ *Chưa đóng tiền*, *Hay đi trễ*, *Ý thức kém*, cùng ghi chú tự do.
- **Tài khoản người chơi** đã liên kết (nếu người đó tự tham gia qua link). Host có thể huỷ liên kết.
- **Lịch sử thay đổi**: DUPR, loại, hạng, trạng thái hoạt động, trạng thái thanh toán gói. Xem [4.11](#411-lịch-sử-thay-đổi-scd-type-2).

**Ngày sinh & thâm niên:**
- Cột **Ngày sinh** (dd/mm/yyyy; thành viên cũ mới có năm sinh hiện "1990 · thiếu ngày" để Host bổ sung) và **Vào CLB** (tháng/năm + thâm niên, VD "2 năm 3 tháng"). Nhập khi thêm thành viên hoặc sửa trong chi tiết thành viên. Thành viên mới mặc định vào CLB tháng hiện tại.
- Người có **sinh nhật trong tháng** hiện 🎂, và đầu trang có dòng "Sinh nhật tháng này" để CLB chuẩn bị quà.
- **Nhắc sinh nhật trên web:** ở đầu mọi trang của Host (Club) hiện khung 🎂 khi có thành viên đang hoạt động sinh nhật **hôm nay** (kèm "tròn N tuổi") hoặc **trong 3 ngày tới** ("ngày mai", "còn 2/3 ngày" + ngày). Bấm × để ẩn đến hết hôm nay. Chỉ tính thành viên đã có ngày sinh đầy đủ.
- Bảng thành viên chỉ để xem thông tin; số buổi còn lại xem ở **Thống kê → Thống kê thành viên**.

**Hai tab: "Đã là thành viên" và "Chờ xác nhận":**
- Khi người chơi bấm *Tôi là thành viên CLB* trên trang đăng ký kèo, app tìm thành viên có cùng SĐT:
  - **Khớp SĐT** → tài khoản được gắn vào thành viên đó, chờ Host xác nhận.
  - **Không khớp** → tạo một **yêu cầu vào CLB** mới (chưa hiện trong danh sách chính).
- Host nhận thông báo qua webhook (loại `member_request`), menu **Thành viên** hiện **số đỏ** đếm người đang chờ, và trang Thành viên có dòng nhắc.
- Tab **Chờ xác nhận** hiện tên tài khoản, email, SĐT, DUPR và loại yêu cầu:
  - **Duyệt** → thành viên đã xác thực, đăng ký kèo như thành viên (dùng buổi trong gói, không trả phí).
  - **Từ chối** → yêu cầu mới bị xoá; nếu là khớp SĐT thì chỉ gỡ liên kết tài khoản (thành viên vẫn giữ). Người đó đăng ký như khách.

Số người tối đa phụ thuộc gói dịch vụ của Host (xem [8.4](#84-gói-dịch-vụ--giới-hạn)).

### 4.4. Gói hội viên (`/finance/plans`)

**Tạo gói:**
- Mỗi gói có tên, **chu kỳ** (tháng / quý / năm), giá và **số buổi mỗi kỳ** (0 = không giới hạn).
- Gói có thể *Ngừng bán* hoặc *Bán lại*.

**Đăng ký gói cho thành viên** (trong chi tiết thành viên):
- Chọn gói, tháng bắt đầu và số kỳ. Ví dụ: gói tháng, bắt đầu tháng 8, 3 kỳ → tạo gói cho tháng 8, 9 và 10.
- Nếu tick *Đã thu tiền*, app ghi luôn một khoản **thu** vào quỹ CLB.

**Trạng thái gói:**
- *Đang hiệu lực* / *Chưa đóng tiền* / *Hết hạn*, kèm "Đã dùng x/y buổi".
- Đánh dấu **đã đóng** thì app tự ghi thu vào quỹ. Đánh dấu **chưa đóng** lại thì khoản thu đó tự bị huỷ.
- Xoá gói cũng huỷ khoản thu đi kèm.

### 4.5. Tạo hoạt động: lịch sự kiện, lịch hàng tuần, giải đấu, kèo
Menu **Tạo hoạt động** gồm 4 mục:

| Mục | Đường dẫn | Dùng để |
|---|---|---|
| **Lịch sự kiện** | `/events` | **Chỉ xem** toàn bộ hoạt động của CLB: lịch chơi hàng tuần 🗓, kèo 🏓, buổi tập 🎯, họp 👥, kèo thách đấu ⚔️ và **giải đấu 🏆**. Dạng **Danh sách / Tháng / Tuần / Ngày** (xem [5.1](#51-lịch-kèo-dạng-calendar-events)). Bấm vào giải thì mở trang giải. |
| **Tạo lịch chơi hàng tuần** | `/events/create/weekly` | Buổi chơi cố định của CLB. Tick **các thứ trong tuần** (VD T3, T5, T7) và chọn **từ ngày – đến ngày**; lịch bên dưới tô sẵn mọi buổi, bấm vào một ngày để thêm/bỏ riêng buổi đó (nghỉ lễ, buổi bù). App tạo tất cả trong một lần (tối đa 200 buổi). |
| **Tạo giải đấu** | `/club/tournaments/new` | Xem [4.8](#48-giải-đấu-nội-bộ-clubtournaments). |
| **Tạo kèo** | `/events/create` | Một buổi lẻ. Chọn **loại hoạt động**: *Kèo giao lưu*, *Buổi tập*, *Họp / gặp mặt*, hoặc *Kèo thách đấu* (kèo ăn thua giữa thành viên: bên thua trả tiền sân/nước…; ghi tỉ số ở mục Trận đấu sau khi chơi). Các ô còn lại giống [5.2](#52-tạo-kèo-eventscreate). |

Loại hoạt động sửa được ở trang *Sửa* của buổi.

Trang chi tiết buổi:
- Trang chi tiết buổi giống kèo Xé Vé (xem [mục 5](#5-tính-năng-chi-tiết--xé-vé-manager)), cộng thêm:
  - **Nhập từ CLB**: chọn thành viên đưa vào buổi.
  - **Check-in một hội viên sẽ tự trừ 1 buổi** trong gói còn hiệu lực. App báo "đã trừ 1 buổi, còn n buổi", hoặc "gói không giới hạn", hoặc "không có gói còn hiệu lực". Huỷ check-in thì buổi được hoàn lại. Mỗi buổi chỉ trừ tối đa 1 lần.

### 4.6. Trận đấu (`/club/matches`)
Nằm trong menu **Thống kê** (cùng Bảng xếp hạng và Phân tích).
- **Nhập trận** theo thể thức Đơn, Đôi hoặc Đôi nam nữ (mỗi đội 1 nam + 1 nữ). Mỗi trận gồm người chơi 2 đội, tỷ số và thời gian.
- Sửa tỷ số hoặc xoá trận. Bảng xếp hạng tự tính lại.
- (Phần gắn link video YouTube tạm thời đã bỏ khỏi app.)
- Trận nhập trong trang của một buổi cũng được tính.

### 4.7. Bảng xếp hạng & vinh danh (`/club/rankings`)
- Xếp hạng theo kỳ **Ngày / Tháng / Quý / Năm / Tất cả**, có nút chuyển kỳ trước/kỳ sau.
- Các cột: trận, thắng, thua, tỷ lệ thắng, điểm ghi, điểm thua, hiệu số, số buổi đã chơi.
- **Vinh danh** mỗi kỳ:
  - Top tỷ lệ thắng
  - Top hiệu số
  - **Chăm chỉ nhất** (đi nhiều buổi nhất)
  - **Giải mâm xôi** (tỷ lệ thắng thấp nhất — cố lên!)
- Giải về tỷ lệ thắng chỉ xét người chơi từ **3 trận** trở lên trong kỳ.
- Xuất Excel.

### 4.8. Giải đấu nội bộ (`/club/tournaments`)

Trang **Tạo giải đấu** bắt đầu bằng mục **1. Thể thức**: chọn 1 trong 2 kiểu, đặt tên giải, ngày, giờ và địa điểm (giải hiện trên Lịch sự kiện). Danh sách các giải đã tạo ở link *Các giải đã tạo →*.

#### Thể thức 1 — Đánh theo bảng
Giải trong CLB luôn là **đánh đôi**: cặp nam, nữ hay nam nữ đều được, không chia nội dung đơn / đôi nam / đôi nam nữ (đánh đơn nằm trong giải Đồng đội). Mục 1 có ô **💰 Lệ phí / người**.

**Thu lệ phí giải:** khi giải có lệ phí, trang giải có mục **💰 Lệ phí giải**: tổng đã thu / cần thu (lệ phí × số người) và danh sách người chơi. Bấm vào tên khi người đó đã đóng → app ghi 1 khoản thu *Lệ phí giải* vào quỹ CLB (xem ở Tài chính → Sổ thu chi); bấm lại để bỏ đánh dấu thì khoản thu bị hủy. Sửa giải vẫn giữ nguyên ai đã đóng; xóa giải thì các khoản thu lệ phí bị hủy.
1. Chọn người chơi.

3. **Ghép cặp**:
   - *Cân bằng*: người trình độ cao ghép với người thấp hơn để các đội đều sức. Người chưa có DUPR được tính là 3.0.
   - *Ngẫu nhiên*.
   - Sau khi ghép vẫn sửa được từng cặp, thêm hoặc bỏ đội.
4. Chọn thể thức:
   - **Vòng bảng → loại trực tiếp**: chọn số bảng và số đội mỗi bảng đi tiếp. Các đội được chia bảng theo kiểu "rắn" để các bảng cân sức.
   - **Chỉ loại trực tiếp**.
5. Bấm **Tạo giải & xếp lịch**. App tự sinh lịch vòng tròn trong mỗi bảng.

**Ghép cặp phải đủ:** cặp nào còn thiếu người sẽ báo đỏ và nút *Tạo giải* bị khoá (trước đây cặp thiếu bị bỏ ra khỏi giải mà không báo, nên bảng đấu bị hụt đội). Người được chọn mà chưa có cặp được liệt kê màu vàng.

**Quay lại sửa giải:** trang giải có nút *← Các giải đã tạo* và **✏️ Sửa**. *Sửa* mở lại trang tạo giải với tên, ngày, lệ phí, người chơi, cặp, số bảng… đã điền sẵn; bấm *Tạo giải & xếp lịch* thì giải cũ được thay bằng giải mới (lịch xếp lại; nếu đã có kết quả, app hỏi trước vì kết quả sẽ mất).

**Trong giải:**
- Nhập tỷ số từng trận. Bảng xếp hạng vòng bảng tính theo thắng và hiệu số.
- Nhập xong vòng bảng thì bấm **Tạo vòng loại trực tiếp**. Đội hạt giống cao được **miễn đấu** nếu số đội không tròn, người thắng tự vào vòng sau. Các vòng hiển thị là tứ kết, bán kết, chung kết, rồi đến **Vô địch**.
- Có thể *Làm lại vòng loại trực tiếp* mà vẫn giữ kết quả vòng bảng, hoặc xoá kết quả một trận.

#### Thể thức 2 — Đồng đội (Team League)
Các đội 4–8 người đá **vòng tròn**, mỗi lần hai đội gặp nhau là một **lượt đấu** gồm nhiều **trận phụ**.
1. **Trận phụ mỗi lượt đấu**: chọn trong *Đôi nam, Đôi nữ, Đôi nam nữ, Đôi tự do, Đơn* (mặc định 3 trận: đôi nam, đôi nữ, đôi nam nữ).
2. **Cách tính thắng lượt đấu**:
   - *Thắng nhiều trận phụ hơn* — ví dụ thắng 2/3 là thắng; khi đã thắng đủ thì lượt đấu kết thúc sớm. Bằng nhau thì xét tổng điểm.
   - *Tổng điểm các trận phụ* — cộng điểm mọi trận phụ, đội nhiều điểm hơn thắng.
3. Chọn người chơi (cần có giới tính để xếp đôi nam / nữ / nam nữ).
4. **Chia đội**: nhập số đội (app gợi ý ~6 người/đội) rồi bấm **Chia đội cân bằng**. Trợ lý cộng **tổng DUPR** từng đội (chưa có DUPR tính 3.0), chia đều nam/nữ và số người, rồi đổi chỗ người cùng giới cho tới khi chênh lệch tổng DUPR nhỏ nhất. Hiện *chênh lệch tổng DUPR giữa đội mạnh nhất và yếu nhất*. Sau đó vẫn đổi tên đội, chuyển người giữa các đội, thêm/bỏ đội được. Có nút *Ghép ngẫu nhiên*. Đội thiếu người cho một trận phụ (ví dụ không đủ 2 nữ cho đôi nữ) sẽ báo đỏ.
5. **Tạo giải & xếp lịch**: app sinh lịch vòng tròn, mỗi lượt đấu có sẵn các trận phụ.

**Trong giải Team League:**
- **Bảng xếp hạng**: thắng 3 điểm, hoà 1 điểm; bằng điểm thì xét *hiệu số trận phụ*, rồi *hiệu số điểm*.
- **Lượt đấu** theo từng lượt: bấm một trận phụ để chọn người đánh mỗi bên (chỉ hiện người trong đội, đúng giới tính của trận phụ) và nhập tỷ số (không có hoà). Chọn người không bắt buộc.
- Tỷ số lượt đấu = số trận phụ thắng. Xong mọi lượt đấu thì hiện **Vô địch**. Xoá kết quả một trận phụ thì lượt đấu mở lại.
- **Danh sách đội** kèm tổng DUPR từng đội.

**Xem vòng loại trực tiếp trên điện thoại:** có 2 chế độ, đổi bằng nút *Theo vòng / Sơ đồ*.
- **Theo vòng** (mặc định trên điện thoại): mỗi lần hiện một vòng dạng danh sách. Các nút vòng *Tứ kết → Bán kết → Chung kết* kèm số trận đã xong (vd `2/4`). App tự mở vòng còn trận chưa nhập, và có nút chuyển sang vòng trước/sau.
- **Sơ đồ** (mặc định trên máy tính): cây nhánh đấu đầy đủ. Trên điện thoại **vuốt ngang**, mỗi lần dừng đúng ở một vòng.

### 4.9. Tài chính (`/finance`) — mọi thứ về tiền ở một chỗ

Mục Tài chính có các tab:

| Tab | Nội dung |
|---|---|
| **Tổng quan** (`/finance`) | Số dư quỹ CLB · Thu, chi, lợi nhuận **12 tháng** và **tháng này** · Yêu cầu thanh toán chờ xác nhận · Biểu đồ thu–chi theo tháng và theo hạng mục · Bảng **lãi/lỗ từng buổi/kèo** (số người chơi, thu, chi, lãi) |
| **Sổ thu chi** (`/finance/ledger`) | Thêm khoản **Thu/Chi** · Lọc theo loại, tháng, hạng mục · Tổng thu/chi/chênh lệch của phần đang lọc · **Huỷ** khoản kèm lý do · Tuỳ chọn hiện các khoản đã huỷ |
| **Gói hội viên** (`/finance/plans`) | Xem [4.4](#44-gói-hội-viên-financeplans) |
| **Kho bóng** (`/finance/inventory`) | Xem [4.10](#410-kho-bóng-financeinventory) |

**Hạng mục có sẵn:**
- Thu: Hội viên, Phí kèo, Giải thưởng, Khác.
- Chi: Tiền sân, Bóng, Nước, HLV/Coach, Giải thưởng, Khác.
- Chọn **Khác (tự nhập)** để gõ hạng mục riêng.

**Khoản tự động** (có nhãn *tự động*) được app ghi khi:
- gói hội viên được đánh dấu đã đóng;
- nhập bóng có tick "Ghi vào chi quỹ";
- đánh dấu người chơi **đã thu phí** trong một kèo.

Các khoản tự động **không huỷ được từ Sổ thu chi**. Muốn sửa thì sửa tại nơi tạo ra nó, để sổ luôn khớp với gói, kho và danh sách kèo.

**Sổ thu chi chỉ thêm, không sửa.** Số tiền, loại và chủ sở hữu của một khoản không bao giờ bị ghi đè (database chặn bằng trigger). Muốn sửa thì huỷ khoản cũ rồi tạo khoản mới, nhờ vậy luôn truy vết được.

Link cũ `/club/fund`, `/club/plans`, `/club/inventory` tự chuyển sang trang mới.

### 4.10. Kho bóng (`/finance/inventory`)
- **Thêm loại bóng** gồm tên (ví dụ Franklin X-40), số lỗ (40 lỗ ngoài trời, 26 lỗ trong nhà…) và đơn vị.
- Ghi các lần xuất/nhập:
  - **Nhập hàng**: số lượng và đơn giá. Có thể tick "Ghi vào chi quỹ CLB" để tự tạo khoản chi.
  - **Bóng hỏng/thay**: số lượng và *dùng được khoảng bao nhiêu buổi*.
  - **Điều chỉnh tồn**: dùng số âm khi kiểm kho thiếu.
- App tính cho mỗi loại:
  - **tồn kho**
  - **giá trung bình / quả**
  - **độ bền (buổi/quả)**
  - **chi phí / quả / buổi**
  - tổng đã chi
- Biểu đồ **so sánh chi phí mỗi quả mỗi buổi** giữa các loại (thấp hơn = tiết kiệm hơn).
- App không cho tồn kho âm, dù là khi ghi bóng hỏng, điều chỉnh âm hay xoá một lần nhập.
- Xoá một dòng nhập hàng cũng huỷ khoản chi quỹ đi kèm.

### 4.11. Lịch sử thay đổi (SCD Type 2)
Mọi thay đổi của các thuộc tính quan trọng được lưu thành **dòng thời gian** (từ ngày A → ngày B), không ghi đè dữ liệu cũ:
- DUPR, loại, hạng và trạng thái hoạt động của thành viên;
- trạng thái thanh toán và số tiền của gói hội viên;
- DUPR trong hồ sơ người chơi.

Database ghi lịch sử bằng trigger, nên dù thay đổi đến từ đâu cũng không bị sót. Xem trong chi tiết thành viên → *Xem lịch sử thay đổi*.

### 4.12. Link tham gia CLB & thanh toán VietQR
Cài đặt trong **CLB của tôi → Thanh toán & link tham gia**:
- Bật *Cho phép người chơi tự đăng ký qua link* và copy **link tham gia** (`/join/<token>`) gửi vào nhóm. Có thể *Tạo link mới*, khi đó link cũ hết hiệu lực.
- Viết lời nhắn hiển thị trên trang tham gia.
- Nhập **mã ngân hàng** (VCB, TCB, MB, ACB…), **số tài khoản** và **tên chủ tài khoản**. App hiện mã QR mẫu để kiểm tra.

Khi người chơi đăng ký gói qua link:
1. App tạo một **mã thanh toán** ngắn, ví dụ `PBK7QX2M`, và mã **VietQR** đã điền sẵn số tiền và nội dung chuyển khoản. Quét bằng app ngân hàng nào cũng được.
2. Yêu cầu hiện ở **Tài chính → Tổng quan → Chờ xác nhận thanh toán**.
3. Nhận được tiền thì Host bấm **Đã nhận tiền**. Gói chuyển sang *Đã đóng* và app ghi khoản thu vào quỹ.

### 4.13. Thống kê thành viên (`/club/attendance`)
Menu **Thống kê → Thống kê thành viên**. Chọn kỳ *Tháng / Quý / Năm* (nút ‹ ›) hoặc *Tùy chọn* từ ngày – đến ngày. Ba tab:
- **Số buổi chơi**: bảng giống file điểm danh Excel — mỗi dòng một thành viên, mỗi cột một buổi (kèm biểu tượng loại hoạt động). `x` xanh = có mặt (đã check-in), `x` đỏ = vắng / huỷ muộn, `·` = đã đăng ký chưa check-in. Cột **Số buổi** có thanh biểu đồ. Xem *Theo buổi* hoặc *Theo tháng*, sắp xếp A→Z hoặc *Chơi nhiều*, hàng cuối đếm thành viên và khách mỗi buổi. **Xuất Excel (CSV)**.
- **Buổi còn lại & bảo lưu**: mỗi gói hội viên trong kỳ — số buổi của gói, đã dùng, còn lại. Gói đã hết kỳ, đã đóng tiền mà còn buổi = số buổi cần **bảo lưu** sang kỳ sau (có tổng).
- **Khách giao lưu**: người ngoài CLB đã đến các buổi (gộp theo SĐT), đánh dấu từng buổi và tổng số lần đến.

### 4.14. Thống kê (`/analytics`)
- **Tỷ lệ vắng mặt theo khung giờ**: heatmap *thứ trong tuần × khung giờ bắt đầu*, tính trên các buổi đã qua trong những tháng gần đây. Ô càng sáng thì khung giờ đó càng hay bị "bùng" kèo, giúp chọn giờ mở kèo.
- **Phong độ theo thời gian** của một thành viên: tỷ lệ thắng và hiệu số theo từng tháng.

(Biểu đồ tiền nằm ở **Tài chính → Tổng quan**.)

---

## 5. Tính năng chi tiết — Xé Vé Manager

### 5.1. Lịch kèo dạng calendar (`/events`)
Trang Lịch/Kèo có 4 chế độ xem. App nhớ chế độ bạn chọn lần trước.

| Chế độ | Hiển thị |
|---|---|
| **Danh sách** | Kèo *sắp diễn ra* dạng thẻ. Kèo *đã qua* được thu gọn, bấm để mở. |
| **Tháng** | Lưới 7 cột kiểu Google Calendar. Mỗi ô ngày có tối đa 3 kèo (giờ + tên), phần còn lại hiện "+n kèo". Trên điện thoại mỗi kèo là một chấm màu. |
| **Tuần** | Lưới giờ, mỗi kèo là **một khối màu trải dài từ giờ bắt đầu đến giờ kết thúc**, trong khối có số người/số chỗ. Kèo trùng giờ được xếp cạnh nhau. Lịch tự cuộn tới kèo sớm nhất. Trên điện thoại vuốt ngang để xem cả tuần. |
| **Ngày** | Lưới giờ của một ngày, cạnh đó là **timeline chi tiết**: giờ, địa điểm, số sân, trạng thái, số người/số chỗ, phí. Trên điện thoại timeline hiện lên trước. |

- **Màu theo trạng thái:** xanh chanh = Đang mở, xám = Nháp, vàng = Đã đóng, xanh dương = Đã xong, đỏ gạch ngang = Đã huỷ. Chú thích màu nằm dưới lịch.
- Nút **‹ Hôm nay ›** để chuyển kỳ.
- Nút 📅 mở **lịch nhỏ dạng popover**: ngày có kèo có dấu chấm. **Bấm vào một ngày** (trên lịch nhỏ, ô tháng hay tiêu đề cột tuần) thì màn hình chuyển sang chế độ Ngày và lọc đúng các kèo của ngày đó dạng timeline.
- Nhìn lướt là biết ngày nào kín lịch, ngày nào còn trống sân. Ngày trống hiện "Ngày này còn trống sân".
- Kèo chưa có giờ bắt đầu hiện ở hàng **Cả ngày**. Kèo không có giờ kết thúc được tính là 2 tiếng.

### 5.2. Tạo kèo (`/events/create`)
Bấm **＋ Tạo sự kiện mới**. Nếu đang ở chế độ Ngày thì form điền sẵn ngày đó. Form chia 4 nhóm:

| Nhóm | Trường |
|---|---|
| **1. Thông tin cơ bản** | Tên kèo · **Ngày** (chọn bằng lịch popover) · Giờ bắt đầu · Giờ kết thúc · Địa điểm · Số sân · *(Club)* Lặp lại hằng tuần |
| **2. Luật & tài chính** | Số chỗ · Phí tham gia · DUPR từ–đến · Hạn đăng ký · **Hạn chót huỷ kèo** (xem [5.5](#55-chính-sách-huỷ--hoàn-buổi)) |
| **3. Thông báo cho người chơi** | Ghi chú hiện trên trang đăng ký (vd: sân số 3, chuyển khoản trước 20h…) · Cho phép đăng ký qua link |
| **4. Trạng thái** | *Nháp → Đang mở → Đã đóng → Đã xong*, hoặc *Đã huỷ* |

Form kiểm tra trước khi gửi: giờ kết thúc phải sau giờ bắt đầu, và "DUPR đến" phải lớn hơn hoặc bằng "DUPR từ". Tạo 1 kèo thì app mở luôn trang kèo để bạn copy link đăng ký. Tạo nhiều tuần thì app quay về lịch.

### 5.3. Đăng ký qua link: đăng nhập → xác nhận → thanh toán → nhận vé (`/e/<token>`)
Bật **Cho phép đăng ký qua link**, rồi *Copy link* hoặc *Chia sẻ* vào nhóm Zalo/Telegram. Ai cũng xem được trang kèo (thông tin, phí, trình độ, số chỗ, thông báo của Host, chính sách huỷ, danh sách người tham gia). Nhưng **muốn đăng ký thì phải đăng nhập**, để app biết người đó là **thành viên CLB** hay **khách giao lưu**.

| Bước | Người chơi thấy gì |
|---|---|
| **1. Đăng nhập / Đăng ký** | Nút "Đăng nhập / Đăng ký để tham gia". Xong thì quay lại đúng trang kèo. Lần đầu nhập họ tên + số điện thoại (+ DUPR). |
| **2. Xác nhận** | App cho biết bạn đăng ký với tư cách gì và phải trả bao nhiêu: *Thành viên có gói còn hiệu lực* thì "Trừ 1 buổi trong gói"; *khách* (hoặc thành viên hết gói) thì "Phí buổi này 130.000 ₫". Tick "Tôi đã đọc thông tin kèo…" rồi bấm **Xác nhận**. |
| **3. Thanh toán** (khách, phí > 0) | Chỗ được **giữ 30 phút**. Trang hiện **VietQR** (đã điền sẵn số tiền + nội dung `PBxxxxxx`), **ảnh QR ngân hàng của Host** (nếu Host tải lên), số tài khoản và nút Copy. Chuyển khoản xong, **tải ảnh chụp màn hình giao dịch** lên. Trạng thái chuyển thành **"⏳ Host đang xác nhận thanh toán"**. |
| **4. Nhận vé** | Host xác nhận thì trang chuyển thành **"🎉 Đăng ký thành công"** kèm **vé QR check-in**, có khung vàng nhắc rất rõ: **"📸 CHỤP MÀN HÌNH MÃ QR NÀY"**. Nếu đã kết nối Telegram, người chơi cũng nhận tin kèm link vé. |

- **Thành viên có gói** và **kèo miễn phí** đi thẳng từ bước 2 sang bước 4 (không cần thanh toán).
- **Quá 30 phút chưa gửi ảnh** thì chỗ tự được nhả cho người trong danh sách chờ. **Host từ chối ảnh** (kèm lý do, ví dụ "sai số tiền") thì người chơi có thêm 2 giờ để gửi ảnh khác.
- **Hết chỗ** thì vào **danh sách chờ**, chưa phải trả tiền. Khi có người huỷ, người đầu danh sách được đẩy lên: thành viên có gói thì vào thẳng; khách thì nhận tin "đã có chỗ, hãy chuyển khoản trong 2 giờ".
- **Mỗi lượt đăng ký có một vé riêng** (`/t/<mã vé>`, không cần đăng nhập để mở). Lỡ mất ảnh thì mở lại link kèo, Cổng người chơi, hoặc trang vé; Host cũng check-in tay được.
- **Chuyển nhượng slot** (khách không đi được): bấm *Chuyển nhượng slot cho người khác* → nhập tên + SĐT người nhận → vé cũ mất hiệu lực, người nhận có **vé mới** (gửi link hoặc ảnh QR cho họ). Slot của thành viên gắn với gói nên không tự chuyển được; Host vẫn chuyển giúp được.
- **Huỷ**: theo [chính sách huỷ](#55-chính-sách-huỷ--hoàn-buổi). Khách đã trả tiền huỷ trước hạn thì Host thấy nhãn **Cần hoàn tiền**.
- **Số điện thoại chỉ Host thấy.** Một số điện thoại chỉ có một lượt đăng ký còn hiệu lực mỗi kèo.
- Link bị chặn khi kèo tắt đăng ký, không ở trạng thái *Đang mở* hoặc đã quá hạn đăng ký.

**Thành viên CLB được xác thực thế nào?** Tài khoản chỉ được tính là thành viên khi **Host đã xác thực**:
- Người chơi bấm **"Tôi là thành viên — gửi Host xác thực"** trên trang kèo. App tìm thành viên có cùng số điện thoại và gắn tài khoản vào, trạng thái *chờ xác thực*. (Tham gia CLB qua link `/join` cũng gắn tài khoản như vậy.)
- Host vào **Thành viên** (có banner "n tài khoản chờ xác thực") → bấm tên → **Xác thực**. Host xác nhận thanh toán gói hội viên của người đó cũng coi như đã xác thực.
- Trong lúc chờ, người chơi vẫn đăng ký được như khách (trả phí).

### 5.4. Quản lý người chơi trong kèo (`/events/<id>`)
- **Thanh điều khiển kèo** (Host bấm tay lúc nào cũng được, không phụ thuộc hạn đăng ký):
  - **🔓 Mở đăng ký / 🔒 Đóng đăng ký**. Mở lại khi hạn đăng ký đã qua thì hạn cũ được xoá để mọi người đăng ký tiếp.
  - **✓ Đánh dấu đã xong**.
  - **✏️ Sửa thông tin** (`/events/<id>/edit`): sửa ngày, giờ, địa điểm, phí, số chỗ… Nếu kèo đã có người đăng ký, app nhắc bạn báo lại cho họ.
  - **Huỷ kèo**: giữ lại danh sách và thu chi, và báo cho mọi người đã đăng ký (Telegram + webhook `event_cancelled`). Khách đã trả tiền cần được hoàn.
  - **🗑 Xoá**: kèo trống thì xoá ngay. Kèo đã có người đăng ký hoặc có thu chi thì app hỏi lại lần hai (xoá sẽ mất hết lịch sử) và gợi ý dùng *Huỷ kèo* thay thế.
- **Bảng đếm trên sân**: *Đã đến sân* (x/y) · *Giữ chỗ / tổng* · *Chờ xác nhận thanh toán* · *Chờ chuyển khoản* · *Danh sách chờ*.
- **💸 Thanh toán cần xác nhận**: danh sách khách đang giữ chỗ.
  - Người đã gửi ảnh: bấm **Xem ảnh** để mở ảnh chụp chuyển khoản (kèm số tiền và nội dung cần khớp), rồi **Xác nhận** hoặc **Từ chối** (ghi lý do).
  - Người chưa gửi ảnh: hiện giờ hết hạn giữ chỗ. Khách trả tiền mặt tại sân thì bấm **Đã thu tiền mặt**.
  - Xác nhận xong, người chơi nhận vé QR và khoản **Phí kèo** tự ghi vào thu của kèo.
  - Mọi ảnh chờ xác nhận của mọi kèo cũng hiện ở **Tài chính → Tổng quan**.
- **Danh sách chính** (x/số chỗ), **danh sách chờ** và **đã huỷ**. Thêm tay (người không dùng smartphone), hoặc nhập từ CLB (workspace Club). Nhãn *Hội viên* / *Khách* cho từng người.
- Thao tác từng người:
  - **Check-in** / **Vắng mặt** / **Hoàn tác**
  - **Đưa lên DS chính** (người trong danh sách chờ; người đó nhận thông báo)
  - **Huỷ đăng ký** (có hỏi xác nhận, áp dụng [chính sách huỷ](#55-chính-sách-huỷ--hoàn-buổi))
  - **Miễn phạt** (người huỷ muộn)
  - **Chuyển slot**: đổi sang tên + SĐT người khác, cấp vé mới
  - Bật/tắt **đã thu phí**; người huỷ trước hạn đã trả tiền có nhãn **Cần hoàn tiền** → bấm *Đánh dấu đã hoàn tiền* (khoản thu phí tự bị huỷ)
- **📷 Quét QR**: check-in bằng vé QR hoặc mã QR cá nhân của người chơi (xem [6.3](#63-check-in-bằng-mã-qr)). Người quên ảnh thì Host bấm **Check-in** tay trong danh sách, hoặc gõ mã vé trong ô dưới camera.
- Khi một người trong danh sách chính huỷ, người đầu tiên trong danh sách chờ **tự được đưa lên** và **được báo ngay** qua Telegram / webhook (xem [8.6](#86-thông-báo-khi-được-đẩy-từ-danh-sách-chờ)).
- Nhập trận đấu của kèo ngay trong trang.
- Sửa trạng thái, hạn đăng ký, hạn chót huỷ và thông báo ở khung **Link đăng ký**.

### 5.5. Chính sách huỷ & hoàn buổi
Mỗi kèo có thể đặt **Hạn chót huỷ kèo**: *Không giới hạn*, hoặc trước **2 / 6 / 12 / 24 / 48 tiếng** so với giờ bắt đầu (tính theo giờ Việt Nam, `APP_TZ`).

| Khi nào huỷ | Hội viên có gói | Người chơi trả phí theo kèo |
|---|---|---|
| **Trước hạn chót** (hoặc kèo không đặt hạn) | Không trừ buổi. Nếu đã check-in thì buổi được hoàn lại. | Không tính phí |
| **Sau hạn chót** → nhãn **Huỷ muộn** | **Vẫn trừ 1 buổi** | **Vẫn tính phí**. Khoản này hiện ở mục *Phí kèo chưa thanh toán* và cộng vào *Công nợ* trong Cổng người chơi, cho đến khi Host tick *đã thu phí*. |

- Người trong **danh sách chờ** huỷ lúc nào cũng miễn phí, vì họ chưa giữ chỗ.
- Luật trên áp dụng như nhau khi **Host huỷ giúp** và khi **người chơi tự huỷ** trong Cổng người chơi.
- Host có thể bấm **Miễn phạt** ở mục *Đã huỷ*: buổi được hoàn lại và không tính phí nữa (ví dụ người chơi bị ốm, có lý do chính đáng).
- Suất trống sau khi huỷ, dù sớm hay muộn, đều được chuyển ngay cho người đầu danh sách chờ.

### 5.6. Tài chính của kèo
- Thêm khoản thu/chi cho kèo (tiền sân, bóng, nước…).
- Tick *đã thu phí* thì app tự ghi khoản **Phí kèo**. Bỏ tick thì khoản đó tự bị huỷ.
- Xem thu, chi và **lợi nhuận ròng** của kèo.
- **Xuất Excel** gồm 2 sheet: *Participants* (người chơi + trạng thái phí) và *Transactions* (thu chi, có **công thức SUM sống**, sửa trong Excel/Sheets thì tổng tự tính lại).
- Tổng hợp mọi kèo: **Tài chính → Tổng quan** (lãi/lỗ từng kèo) và **Sổ thu chi** (mọi khoản của các kèo lẻ, có link về kèo).

---

## 6. Phân quyền: Trọng tài, Điều phối viên, Đồng quản trị

### 6.1. Host cấp quyền (`/staff-access`)
Nhập **email** của người đó, tên (để dễ nhận ra), rồi chọn **vai trò**:

| Vai trò | Được làm | Phạm vi |
|---|---|---|
| **Trọng tài** | Chỉ nhập tỷ số trận đấu | Một kèo · mọi buổi của một CLB · tất cả kèo |
| **Điều phối viên** | Check-in (tay hoặc **quét QR**) + nhập tỷ số | Một kèo · mọi buổi của một CLB · tất cả kèo |
| **Đồng quản trị** (Co-Admin) | Xem & quản lý **Thành viên** và **Tài chính** (tổng quan, sổ thu chi, gói hội viên, kho bóng, xác nhận thanh toán) của **một CLB** | Luôn là **một CLB cụ thể** |

- Trọng tài và điều phối viên **không bao giờ thấy tài chính hay số điện thoại**.
- Đồng quản trị **không** được: xoá CLB, đổi tên, đổi tài khoản ngân hàng nhận tiền hay link tham gia, phân quyền cho người khác, quản lý lịch/trận đấu/giải đấu. Server chặn các thao tác này và trả về lỗi 403.
- Đổi vai trò hoặc thu hồi quyền bất cứ lúc nào.

### 6.2. Người được cấp quyền (`/staff`)
1. Đăng nhập (hoặc đăng ký) bằng **đúng email** được cấp và **xác nhận email**.
2. Chọn workspace **Trọng tài / Điều phối** → *Kèo được giao*.
3. Trong từng kèo có hai tab:
   - **Check-in**: tìm tên, bấm *Đã đến* hoặc *Vắng*, hoàn tác được, có đếm "x/y đã đến".
   - **Tỷ số**: nhập hoặc sửa trận.

Họ **không bao giờ thấy tài chính hay số điện thoại**. Check-in của điều phối viên cũng tự trừ buổi trong gói hội viên như khi Host check-in.

### 6.3. Check-in bằng mã QR
Thay vì lướt tìm tên, làm như sau:
1. Người chơi đưa **vé QR** của lượt đăng ký (mã `PBT:…`, hiện sau khi đăng ký thành công và trên trang vé), hoặc **mã QR cá nhân** trong Cổng người chơi (mã `PBP:…`, nút *Phóng to*).
2. Host (trang kèo) hoặc điều phối viên (trang kèo được giao) bấm **📷 Quét QR**, rồi chĩa camera sau của điện thoại vào mã.
3. App tự **check-in** và **trừ 1 buổi** nếu người đó là hội viên có gói. Kết quả hiện ngay: "✓ Lan đã check-in · còn 5 buổi". Có thể quét liên tục nhiều người. Mỗi mã chỉ tính 1 lần, quét lại sẽ báo "đã check-in trước đó".
4. App báo rõ các trường hợp: *không có tên trong kèo*, *chưa được xác nhận thanh toán*, *đang ở danh sách chờ*, *đã huỷ*, *vé của kèo khác*, *mã không hợp lệ hoặc đã chuyển nhượng*.

- Camera chỉ chạy trên **https** (Vercel đã có sẵn). Nếu không mở được camera, gõ hoặc dán mã `PBT:…` / `PBP:…` vào ô bên dưới.
- Điều phối viên không check-in được người chưa được xác nhận thanh toán; chỉ Host mới làm được (ví dụ thu tiền mặt tại sân).
- Người chơi có thể bấm **Đổi mã mới** nếu lỡ chia sẻ mã. Mã cũ hết hiệu lực ngay.
- Mã QR chỉ nhận diện người chơi. Chỉ Host hoặc điều phối viên của kèo mới dùng được mã để check-in.

### 6.4. Người được cấp quyền đồng quản trị
1. Đăng nhập (hoặc đăng ký) bằng **đúng email** được cấp và **xác nhận email**.
2. Chọn workspace **Club**. CLB được chia sẻ hiện trong danh sách CLB, có nhãn *Đồng quản trị · Được chia sẻ bởi <email chủ CLB>*.
3. Menu chỉ còn **Thành viên**, **Tài chính ▸** và **Cài đặt ▸** (CLB, Tài khoản). Mọi khoản thu/chi họ ghi đều vào **quỹ của chủ CLB**, nên cả hai cùng thấy một sổ.

---

## 7. Cổng người chơi

Người chơi dùng chung app, chọn workspace **Tôi là người chơi** (`/p`).

- **Hồ sơ** (`/p/profile`): ảnh đại diện, họ tên, số điện thoại, DUPR, giới tính, năm sinh.
- **Mã check-in của tôi**: mã QR cá nhân để Host / điều phối viên quét khi đến sân (*Phóng to*, *Đổi mã mới*).
- **Kết nối Telegram**: bấm nút → mở bot → bấm *Start*. Từ đó người chơi nhận tin nhắn ngay khi được đẩy từ danh sách chờ lên danh sách chính. *Ngắt kết nối* bất cứ lúc nào.
- **Tham gia CLB** qua link `/join/<token>` mà Host gửi:
  1. Chọn gói, tháng bắt đầu và số kỳ. App hiện tổng tiền.
  2. Bấm *Xác nhận đăng ký* (cần đăng nhập và có hồ sơ).
  3. Quét **mã VietQR**, trong đó số tiền và nội dung đã điền sẵn. Hoặc copy từng dòng thông tin chuyển khoản.
  4. Host xác nhận xong thì trạng thái chuyển thành *Đã thanh toán ✓*.
- **Trang của tôi**, cho từng CLB:
  - **buổi còn lại**;
  - **công nợ**;
  - kỳ hiện tại và các gói đã đăng ký;
  - yêu cầu *chờ thanh toán* (xem lại QR hoặc huỷ yêu cầu).
- Các mục khác trên **Trang của tôi**:
  - **Lịch sử tham gia**: đã đăng ký / danh sách chờ / đã chơi / vắng / đã huỷ (kèm nhãn *Huỷ muộn*).
  - **🎟 Xem vé QR** cho từng kèo đã đăng ký thành công; **💸 Thanh toán để giữ chỗ** / *Host đang xác nhận* cho kèo đang chờ.
  - **Tự huỷ kèo sắp tới**: nút *Huỷ* cạnh từng kèo, kèm dòng "Huỷ miễn phí đến 20:00 30/09" hoặc "Đã quá hạn huỷ miễn phí". Nếu đã quá hạn, app hỏi lại trước khi huỷ (xem [5.5](#55-chính-sách-huỷ--hoàn-buổi)).
  - **Phí kèo chưa thanh toán**: các kèo đã chơi hoặc huỷ muộn mà chưa trả phí. Được cộng vào *Công nợ*.
  - **Phong độ 12 tháng**: số trận, số thắng, tỷ lệ thắng, số buổi đã chơi.
  - Biểu đồ **biến động DUPR** (mỗi lần DUPR đổi đều được lưu lại).

---

## 8. Tính năng chung

> **Hồ sơ người chơi bắt buộc có ngày tháng năm sinh đầy đủ** (cùng họ tên, SĐT). Người chơi cũ chỉ có năm sinh sẽ được nhắc cập nhật trước khi đăng ký kèo / CLB. Ngày sinh tự điền vào hồ sơ thành viên CLB của họ nếu Host chưa nhập.


### 8.1. Đăng nhập (`/sign-in`)
Email + mật khẩu qua Supabase Auth. Người đăng ký mới nhận **email xác nhận** và phải bấm xác nhận rồi mới đăng nhập được.

### 8.2. Ngôn ngữ
Tiếng Việt (mặc định) và tiếng Anh, đổi trong menu.

### 8.3. Góp ý
Nút **Góp ý** trong menu, trên cả máy tính lẫn điện thoại. Góp ý được lưu vào database và, nếu đã cấu hình, **gửi về email** của nhà phát triển (xem [mục 13](#13-góp-ý--email-của-bạn)).

### 8.4. Gói dịch vụ & giới hạn
Mỗi Host có một gói, giới hạn **số người đang được quản lý**. Con số này bằng thành viên CLB đang hoạt động cộng với người chơi (đăng ký, chờ, đã check-in) của các kèo chưa kết thúc.

| Gói | Giới hạn |
|---|---|
| free | 30 |
| basic | 100 |
| standard | 300 |
| pro | 1000 |

Khi hết chỗ, app chặn thêm người và báo lỗi. Trang **Tài khoản** hiển thị gói và mức đã dùng (`used/limit`). Nếu backend đặt `ALLOW_TIER_SELF_SERVE=true`, Host tự đổi gói được (tiện cho giai đoạn thử nghiệm). Tắt đi khi có thanh toán thật.

### 8.5. Sao lưu (`/account`)
**Club backup** xuất một file Excel gồm Thành viên, Lịch buổi và Xếp hạng của CLB đang chọn.

### 8.6. Thông báo khi được đẩy từ danh sách chờ
Khi có người huỷ (hoặc Host bấm *Đưa lên DS chính*), người được đẩy lên nhận tin nhắn ngay, dù sát giờ:

> 🎉 Lan ơi, bạn đã được đẩy lên DANH SÁCH CHÍNH THỨC kèo "Kèo tối thứ 5" — 20:00 T5 01/10 tại Sân Kỳ Hòa. Hẹn gặp bạn ở sân!

Có hai kênh độc lập. Kênh nào lỗi cũng không làm hỏng thao tác huỷ.

| Kênh | Cách bật | Ai nhận |
|---|---|---|
| **Bot Telegram** (miễn phí) | Nhà phát triển cài bot một lần (xem [11.3](#113-bot-telegram-thông-báo-danh-sách-chờ)). Người chơi bấm **Kết nối Telegram** trong Cổng người chơi rồi bấm *Start*. | Chính người chơi, qua tin nhắn riêng |
| **Webhook của Host** | **Tài khoản → Thông báo cho người chơi**: dán URL `https://…` rồi bấm *Gửi thử* | Hệ thống của Host (Make / Zapier / n8n), để chuyển tiếp qua **Zalo ZNS**, SMS, nhóm Telegram, Slack… |

Cùng hai kênh đó, app còn gửi các tin sau:

| `type` (webhook) | Khi nào | Ai nhận |
|---|---|---|
| `waitlist_promoted` | Người chờ được đẩy lên (`payment_required: true` nếu là khách phải chuyển khoản trong 2 giờ) | Người chơi + Host |
| `payment_submitted` | Khách vừa gửi ảnh chuyển khoản (`amount`) | Host (chỉ webhook) |
| `payment_confirmed` | Host xác nhận thanh toán (`ticket_url` = link vé) | Người chơi + Host |
| *(chỉ Telegram)* | Host từ chối ảnh chuyển khoản (kèm lý do) | Người chơi |
| `event_cancelled` | Host huỷ kèo (`players` = số người được báo) | Người chơi + Host |
| `member_request` | Có người xin xác nhận là thành viên CLB (`new_member: true` nếu là yêu cầu vào CLB mới, `false` nếu khớp SĐT thành viên có sẵn) | Host (chỉ webhook) |

Trong Make/Zapier, thêm **Filter** theo `type` để mỗi loại tin đi một đường riêng.

Webhook nhận JSON:
```json
{
  "type": "waitlist_promoted",
  "event":  { "id": "…", "title": "Kèo tối thứ 5", "event_date": "2026-10-01", "start_time": "20:00:00", "location": "Sân Kỳ Hòa", "timezone": "Asia/Ho_Chi_Minh" },
  "player": { "full_name": "Lan", "phone": "0901234567" },
  "text": "🎉 Lan ơi, bạn đã được đẩy lên …",
  "created_at": "2026-10-01T10:15:00.000Z"
}
```
Ví dụ Zalo ZNS: trong Make, tạo scenario *Webhooks → Custom webhook*, dán URL vào app, rồi thêm module HTTP gọi API ZNS của Zalo OA với `player.phone` và mẫu tin đã duyệt. Webhook chỉ nhận URL **https công khai**, không nhận localhost hay mạng nội bộ.

---

## 9. Hướng dẫn nhanh theo tình huống

### Mở CLB mới và thu tiền hội viên
1. **Cài đặt → CLB của tôi → Tạo CLB.**
2. **Tài chính → Gói hội viên**: tạo gói, ví dụ "Gói tháng", chu kỳ Tháng, 500.000₫, 8 buổi.
3. **Thành viên → ＋**: thêm thành viên (hoặc để người chơi tự tham gia ở bước 4).
4. **CLB của tôi → Thanh toán & link tham gia**: nhập tài khoản ngân hàng, bật đăng ký qua link, gửi link vào nhóm.
5. Người chơi đăng ký và chuyển khoản bằng QR. Host vào **Tài chính → Tổng quan → Chờ xác nhận** và bấm *Đã nhận tiền*.

### Chơi định kỳ hằng tuần
1. **Tạo hoạt động → Tạo lịch chơi hàng tuần**, tick T3, T5, T7, chọn từ 01/10 đến 31/12, bỏ tick các ngày nghỉ lễ trên lịch.
2. Mỗi buổi: **Nhập từ CLB** (hoặc mở link đăng ký), đến giờ thì **Check-in**. App tự trừ buổi trong gói.
3. Nhập trận ở **Thống kê → Trận đấu**. Cuối tháng xem **Thống kê → Bảng xếp hạng → Tháng → Vinh danh**.

### Duyệt người xin làm thành viên
Menu **Thành viên** có số đỏ → mở tab **Chờ xác nhận** → *Duyệt* (dùng buổi trong gói) hoặc *Từ chối* (đăng ký như khách).

### Mở một kèo Xé Vé
1. Chuyển workspace sang **Xé Vé**, bấm **＋ Tạo sự kiện mới**. Điền 4 nhóm thông tin; chọn *Hạn chót huỷ kèo* (ví dụ trước 12 tiếng) và trạng thái **Đang mở**.
2. *Chia sẻ* link đăng ký vào nhóm. Ai huỷ thì người trong danh sách chờ tự được đẩy lên và nhận tin.
3. Tại sân: **📷 Quét QR** của từng người để check-in (hoặc bấm tay), đánh dấu vắng, tick *đã thu phí*, thêm khoản chi tiền sân và bóng.
4. Xem lãi/lỗ, **Xuất Excel** nếu cần. Chuyển kèo sang **Đã xong**.
5. (Tuỳ chọn) **Cài đặt → Phân quyền**: giao kèo cho một điều phối viên check-in thay mình.

### Buổi giao lưu CLB cố định (ví dụ thứ 7 hằng tuần, 16 chỗ)
Host tạo buổi lặp lại hằng tuần, đặt phí khách (ví dụ 130.000 ₫) và hạn huỷ 12 tiếng, rồi gửi link vào nhóm.
- **TH1: đủ 16 thành viên đăng ký.** Mỗi thành viên (đã được Host xác thực, có gói) đăng nhập → *Xác nhận* → có vé ngay, không trả tiền. Đến sân: quét vé, tự trừ 1 buổi. Bảng đếm cho biết bao nhiêu người đã đến.
- **TH2: thiếu người.** Host gửi link cho người ngoài CLB. Họ đăng ký như **khách** → chuyển khoản → gửi ảnh → Host xác nhận → nhận vé.
  - **TH2.1: khách đến sân.** Quét vé → check-in. Phí đã nằm trong thu của buổi.
  - **TH2.2: khách báo không đến.** Khách tự bấm *Huỷ* (hoặc Host huỷ giúp). Huỷ trước hạn thì Host thấy nhãn **Cần hoàn tiền**, chuyển trả rồi bấm *Đánh dấu đã hoàn tiền*. Huỷ sau hạn thì không hoàn. Chỗ trống tự chuyển cho người chờ.
  - **TH2.3: khách nhường slot cho bạn.** Khách bấm *Chuyển nhượng slot* → nhập tên + SĐT bạn mình → gửi vé mới cho bạn. Vé cũ hết hiệu lực. Host cũng làm được bằng nút *Chuyển slot*.
- **Người không có smartphone / quên ảnh vé:** Host thêm tay hoặc bấm *Check-in* trong danh sách, hoặc gõ mã vé.

### Mời người cùng góp vốn quản lý CLB
**Cài đặt → Phân quyền** → nhập email của họ → chọn **Đồng quản trị** → chọn CLB → *Cấp quyền*. Họ đăng nhập bằng email đó, chọn workspace **Club**, và cùng xem/ghi Thành viên, Tài chính với bạn. Họ không xoá được CLB.

### Tổ chức giải nội bộ
- **Cá nhân & Đôi**: **Tạo hoạt động → Tạo giải đấu** → *Cá nhân & Đôi* → tên, ngày → Đôi + hạng mục (ví dụ Đôi nam) → chọn người chơi → *Ghép cặp cân bằng* → 2 bảng, mỗi bảng 2 đội đi tiếp → *Tạo giải & xếp lịch* → nhập tỷ số vòng bảng → *Tạo vòng loại trực tiếp* → nhập tỷ số đến chung kết.
- **Team League**: **Tạo giải đấu** → *Đồng đội* → giữ 3 trận phụ đôi nam / đôi nữ / đôi nam nữ, luật *thắng 2/3* → *Chọn tất cả* → số đội = 3 → *Chia đội cân bằng* → đổi tên đội → *Tạo giải & xếp lịch* → mỗi lượt đấu bấm từng trận phụ để chọn người và nhập tỷ số.

### Theo dõi chi phí bóng
**Tài chính → Kho bóng** → thêm loại bóng → *Nhập hàng* (tick ghi vào chi quỹ) → mỗi lần bỏ bóng thì ghi *Bóng hỏng/thay* kèm số buổi đã dùng → xem bảng so sánh **chi phí / quả / buổi**.

---

## 10. Cài đặt & chạy trên máy

**Cần có:** Node.js **18+** (khuyên dùng 20/22), npm, và một project **Supabase** (gói free là đủ).

### Bước 1 — Database
1. Tạo project trên https://supabase.com.
2. Mở **SQL Editor**, dán toàn bộ `database/schema.sql` rồi bấm **Run**. File này chạy lại nhiều lần vẫn an toàn và chạy được trên database trống. Khi app **đã có dữ liệu thật**, hãy cập nhật bằng migration thay vì chạy lại cả file (xem [11.2](#112-cập-nhật-database-production-bằng-migration-supabase-cli)).
3. Vào **Project Settings → API** và lấy:
   - `Project URL`
   - `anon public` key (cho web)
   - `service_role` key (cho backend — **giữ bí mật**, không bao giờ để ở frontend)
4. (Khuyến nghị) Vào **Authentication → URL Configuration** và đặt *Site URL* là địa chỉ web của bạn, để link trong email xác nhận trỏ đúng.

### Bước 2 — Backend
```bash
cd backend
npm install
cp .env.example .env      # điền SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm run dev               # http://localhost:4000  (tự restart khi sửa code)
# kiểm tra: curl http://localhost:4000/health  →  {"ok":true}
```

### Bước 3 — Web
```bash
cd web
npm install
cp .env.local.example .env.local   # điền Supabase URL, anon key, NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev                        # http://localhost:3000
```

Mở http://localhost:3000, đăng ký tài khoản, xác nhận email, chọn workspace và bắt đầu.

### Lệnh thường dùng

| Thư mục | Lệnh | Tác dụng |
|---|---|---|
| `backend` | `npm run dev` | Chạy API, tự restart (`node --watch`) |
| `backend` | `npm start` | Chạy API (production) |
| `web` | `npm run dev` | Chạy web ở chế độ phát triển |
| `web` | `npm run build && npm start` | Build và chạy bản production |
| `web` | `npm run lint` | Kiểm tra code |

> Muốn test trên điện thoại trong cùng mạng Wi-Fi: chạy `npm run dev -- -H 0.0.0.0` trong `web/`, đặt `NEXT_PUBLIC_API_URL=http://<IP-máy-tính>:4000`, rồi mở `http://<IP-máy-tính>:3000` trên điện thoại.

---

## 11. Deploy lên Supabase + Render + Vercel

1. **Supabase**: chạy `database/schema.sql` như ở trên.
2. **Backend → Render**:
   - New → **Blueprint**, chọn repo. Render đọc `backend/render.yaml`.
   - Hoặc New → **Web Service**, đặt *Root Directory* `backend`, *Build* `npm install`, *Start* `npm start`.
   - Điền biến môi trường trong **Environment** (xem [mục 12](#12-biến-môi-trường)).
   - Đặt `CORS_ORIGIN` = domain Vercel của bạn.
   - Kiểm tra `https://<tên-service>.onrender.com/health`.
   - Gói free của Render "ngủ" sau 15 phút không có request. Để không bị "ngủ", xem [11.1](#111-giữ-backend-render-luôn-thức-miễn-phí).
3. **Web → Vercel**:
   - New Project, import repo, đặt **Root Directory** là `web`.
   - Thêm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (URL Render).
   - Bấm Deploy.
   - Biến `NEXT_PUBLIC_*` được nhúng lúc build, nên đổi biến thì phải **Redeploy**.
4. Cập nhật **Supabase → Authentication → URL Configuration** với domain Vercel.

### 11.1. Giữ backend Render luôn thức (miễn phí)
Gói free của Render tắt service sau 15 phút không có request. Người dùng đầu tiên sau đó phải chờ 30–60 giây và dễ tưởng web bị sập. Cách khắc phục không tốn tiền:
1. Tạo tài khoản miễn phí tại https://cron-job.org.
2. **Create cronjob**:
   - URL: `https://<tên-service>.onrender.com/health`
   - Schedule: **mỗi 10 phút** (Every 10 minutes)
   - Request method: `GET`
3. Lưu lại. Trong *History* sẽ thấy mỗi 10 phút có một lần gọi trả về `200 {"ok":true}`.

Route `/health` rất nhẹ: không cần đăng nhập và không truy vấn database. Lưu ý gói free của Render có 750 giờ chạy/tháng cho mỗi tài khoản, đủ cho **một** service chạy 24/7. Nếu tài khoản còn service free khác cũng được giữ thức thì tổng giờ sẽ vượt hạn mức.

### 11.2. Cập nhật database production bằng migration (Supabase CLI)
`database/schema.sql` là **ảnh chụp đầy đủ** dùng khi cài mới. Khi app đã có người dùng thật, chạy lại cả file lớn có thể khoá bảng lâu và khó kiểm soát. Từ giai đoạn này, mỗi thay đổi schema còn có **một file migration riêng, có đánh phiên bản** trong `supabase/migrations/`:

```
supabase/migrations/
├── 20260930120000_cancel_policy_qr_coadmin_notify.sql   # hạn huỷ, QR, co-admin, thông báo
├── 20261001090000_paid_signup_tickets.sql               # đăng ký bắt buộc đăng nhập, ảnh chuyển khoản, vé QR, xác thực thành viên
├── 20261002090000_activities_team_tournaments.sql       # loại hoạt động, yêu cầu vào CLB, giải Team League + trận phụ
├── 20261003090000_signup_safety_member_dates.sql        # đăng ký tài khoản không bao giờ lỗi vì trigger, ngày vào CLB, ngày sinh
├── 20261004090000_tournament_entry_fee.sql              # lệ phí tham gia giải
├── 20261005090000_tournament_fee_payments.sql           # ai đã đóng lệ phí giải (ghi thu vào quỹ CLB)
├── 20261006090000_player_birth_date.sql                 # người chơi nhập đủ ngày tháng năm sinh
├── 20261009090000_guest_perks_survey.sql                # khách giao lưu: tự vào danh sách, đặc quyền VIP/Ưu tiên, khảo sát sau buổi, DS chờ
├── 20261010090000_member_phone_link.sql                 # tài khoản tự nhận là thành viên CLB khi SĐT trùng (bỏ nút "Tôi là thành viên")
├── 20261011090000_event_status_simplify.sql            # trạng thái chỉ còn Đang mở / Đã xong (tự động) / Đã hủy
└── 20261012090000_multi_sport_badminton.sql           # nhiều môn: CLB cầu lông (trình độ 6 cấp, tỷ số theo ván, cầu dùng mỗi buổi)
```

Cách dùng (chỉ cần làm một lần cho mỗi máy):
```bash
npm install -g supabase            # hoặc: brew install supabase/tap/supabase
supabase login
supabase init                      # tạo supabase/config.toml, giữ nguyên thư mục migrations
supabase link --project-ref <mã-project>   # lấy trong URL dashboard: app.supabase.com/project/<mã>
```
Mỗi lần kéo code mới có migration:
```bash
supabase migration list            # xem migration nào chưa chạy trên production
supabase db push                   # chạy các migration còn thiếu, theo thứ tự, mỗi file một transaction
```
- **Database đã cài bằng `schema.sql` trước giai đoạn này**: chỉ cần `supabase db push`. Các migration đều viết kiểu an toàn khi chạy lại (`if not exists`…).
- **Cài mới hoàn toàn**: chạy `schema.sql` như bước 1. Sau đó đánh dấu các migration là đã chạy: `supabase migration repair --status applied 20260930120000`.
- **Khi tự thêm thay đổi schema**: `supabase migration new <ten_thay_doi>`, viết SQL vào file mới, cập nhật luôn `schema.sql` cho khớp, thử trên project staging trước rồi mới `db push` lên production.
- Thêm cột mới nên có giá trị mặc định hằng số, và tạo index lớn bằng `create index concurrently` trong một migration riêng. Làm vậy để không khoá bảng lâu.

### 11.3. Bot Telegram thông báo danh sách chờ
1. Mở Telegram, chat với **@BotFather** → `/newbot` → đặt tên. Bạn nhận được **token** và **username** của bot (ví dụ `pb_club_bot`).
2. Trên Render → Environment, thêm `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` và `TELEGRAM_WEBHOOK_SECRET` (một chuỗi ngẫu nhiên dài, chỉ gồm chữ, số, `_` hoặc `-`).
3. Đăng ký webhook một lần, chạy từ máy bạn:
   ```bash
   cd backend
   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... npm run telegram:webhook -- https://<tên-service>.onrender.com
   ```
   Kết quả in ra `200 {"ok":true,…}` là xong. Telegram sẽ gửi tin tới `POST /api/public/telegram`, kèm secret để backend kiểm tra.
4. Người chơi vào Cổng người chơi → **Kết nối Telegram** → bấm *Start* trong bot. Bot trả lời "✅ Đã kết nối".

---

## 12. Biến môi trường

### Backend (`backend/.env` hoặc Render → Environment)

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — **bí mật** |
| `PORT` | | Cổng API (mặc định `4000`; Render tự đặt) |
| `CORS_ORIGIN` | | Domain web được phép gọi API (mặc định `*`) |
| `APP_TZ` | | Múi giờ tính ngày/kỳ (mặc định `Asia/Ho_Chi_Minh`) |
| `ALLOW_TIER_SELF_SERVE` | | `true` cho phép Host tự đổi gói dịch vụ |
| `RESEND_API_KEY` | | Gửi góp ý qua email (Resend) |
| `FEEDBACK_TO_EMAIL` | | Email nhận góp ý (nhiều email cách nhau bằng dấu phẩy) |
| `FEEDBACK_FROM_EMAIL` | | Người gửi, chỉ dùng khi đã xác minh domain riêng trên Resend |
| `FEEDBACK_WEBHOOK_URL` | | Gửi góp ý dạng JSON tới webhook |
| `FEEDBACK_WEBHOOK_SECRET` | | Gửi kèm header `X-Feedback-Secret` |
| `TELEGRAM_BOT_TOKEN` | | Token bot Telegram (từ @BotFather) để nhắn người chơi được đẩy lên danh sách chính |
| `TELEGRAM_BOT_USERNAME` | | Username của bot (không có `@`), dùng cho nút "Kết nối Telegram" |
| `TELEGRAM_WEBHOOK_SECRET` | | Chuỗi bí mật Telegram gửi kèm mỗi cập nhật (header `X-Telegram-Bot-Api-Secret-Token`) |
| `TELEGRAM_API_URL` | | Tuỳ chọn: Bot API server tự host (mặc định `https://api.telegram.org`) |
| `PUBLIC_WEB_URL` | | Địa chỉ web (ví dụ `https://pickleball-manager.vercel.app`) để đưa link vé / link thanh toán / link khảo sát vào tin nhắn. Bỏ trống thì dùng `CORS_ORIGIN` nếu là https. |
| `NOTIFY_FROM_EMAIL` | | Tuỳ chọn: gửi email cảm ơn + link khảo sát cho khách giao lưu (cần `RESEND_API_KEY` và một domain đã xác minh trên Resend, ví dụ `CLB <noreply@clb-cua-ban.vn>`). Bỏ trống thì chỉ gửi qua Telegram và hiện trong trang Người chơi. |
| `SURVEY_SWEEP_DISABLED` | | `true` để tắt việc tự gửi khảo sát sau buổi (mặc định bật, kiểm tra 10 phút/lần) |

### Web (`web/.env.local` hoặc Vercel → Environment Variables)

| Biến | Ý nghĩa |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon public key (an toàn để ở frontend) |
| `NEXT_PUBLIC_API_URL` | URL backend, ví dụ `http://localhost:4000` hoặc `https://pickleball-api.onrender.com` |

> ⚠️ **Không bao giờ commit key thật.** `.env` và `.env.local` đã nằm trong `.gitignore`, chỉ các file `*.example` được commit.

---

## 13. Góp ý → email của bạn

Nút **Góp ý** luôn lưu vào bảng `feedback`. Để nhận thông báo, đặt một hoặc cả hai cách sau ở backend. Nếu gửi lỗi, người dùng vẫn gửi góp ý thành công.

**Cách A — Email qua Resend**

| Biến | Giá trị |
|---|---|
| `RESEND_API_KEY` | API key Resend (`re_…`) |
| `FEEDBACK_TO_EMAIL` | email nhận góp ý |
| `FEEDBACK_FROM_EMAIL` | tuỳ chọn, chỉ khi có domain đã xác minh |

Với người gửi mặc định `onboarding@resend.dev`, Resend **chỉ gửi tới email của tài khoản Resend**. Vì vậy hãy đặt `FEEDBACK_TO_EMAIL` đúng bằng email đó. Nếu người dùng để lại email liên hệ, bấm *Reply* là trả lời thẳng cho họ.

**Cách B — Webhook** (không cần nhà cung cấp email)

| Biến | Giá trị |
|---|---|
| `FEEDBACK_WEBHOOK_URL` | URL nhận `POST` JSON |
| `FEEDBACK_WEBHOOK_SECRET` | tuỳ chọn, gửi trong header `X-Feedback-Secret` |

Body JSON gồm `message`, `contact`, `page`, `user_email`, `created_at`, cùng `text` soạn sẵn (và `content` cho Discord). Dùng được với Slack, Discord, Zapier, Make, hoặc Gmail miễn phí qua Google Apps Script:

1. Vào https://script.google.com → New project, dán:

   ```js
   const SECRET = 'chon-mot-chuoi-dai-ngau-nhien';
   function doPost(e) {
     const body = JSON.parse(e.postData.contents);
     // Apps Script không đọc được header nên secret đi kèm URL dạng ?key=...
     if (e.parameter.key !== SECRET) return ContentService.createTextOutput('forbidden');
     MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Góp ý mới — Pickleball Manager', body.text);
     return ContentService.createTextOutput('ok');
   }
   ```
2. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone*, rồi copy URL.
3. Đặt `FEEDBACK_WEBHOOK_URL` = `<URL đó>?key=<SECRET của bạn>`.

---

## 14. Cấu trúc thư mục

```
pickleball-manager/
├── database/
│   └── schema.sql              # ảnh chụp đầy đủ schema (cài mới): bảng, enum, view, trigger, RLS
├── supabase/
│   └── migrations/             # migration có đánh phiên bản cho production (supabase db push)
├── backend/
│   ├── render.yaml             # cấu hình deploy Render
│   ├── scripts/telegram-webhook.js  # đăng ký webhook cho bot Telegram (một lần)
│   └── src/
│       ├── server.js           # khởi tạo Express, gắn các route
│       ├── supabase.js         # client Supabase (service role)
│       ├── middleware/
│       │   ├── auth.js         # requireAuth / optionalAuth (Bearer token Supabase)
│       │   └── checkCapacity.js# giới hạn số người theo gói
│       ├── routes/             # clubs, events, matches, transactions, host,
│       │                       # staff, tournaments, player, analytics
│       ├── services/           # nghiệp vụ dùng chung:
│       │   ├── memberships.js  #   gói hội viên, trừ/hoàn buổi, ngày theo APP_TZ
│       │   ├── attendance.js   #   check-in / vắng / hoàn tác, chính sách huỷ, đẩy DS chờ, check-in QR
│       │   ├── notify.js       #   thông báo Telegram + webhook của Host
│       │   ├── clubAccess.js   #   quyền chủ CLB / đồng quản trị
│       │   ├── matches.js      #   kiểm tra & lưu trận đấu
│       │   ├── stats.js        #   xếp hạng theo kỳ, vinh danh
│       │   ├── tournament.js   #   ghép cặp, chia bảng, vòng tròn, nhánh đấu
│       │   ├── payment.js      #   mã thanh toán, link VietQR
│       │   ├── inventory.js    #   tồn kho, độ bền, chi phí/quả/buổi
│       │   └── feedback.js     #   gửi góp ý qua Resend / webhook
│       └── utils/respond.js
└── web/
    ├── next.config.mjs         # redirect link cũ → /finance/*
    ├── app/                    # các trang (App Router)
    │   ├── sign-in/  dashboard/  clubs/  account/  staff-access/
    │   ├── club/     members/ matches/ rankings/ tournaments/
    │   ├── events/   (lịch: danh sách/tháng/tuần/ngày) + create/ + [eventId]/
    │   ├── finance/  (tổng quan) ledger/ plans/ inventory/
    │   ├── analytics/
    │   ├── staff/    (trọng tài/điều phối)
    │   ├── p/        (cổng người chơi) profile/
    │   ├── e/[token]/     # trang đăng ký kèo công khai
    │   └── join/[token]/  # trang tham gia CLB
    ├── components/         # AppShell (menu), EventCalendar, DatePopover, QrScanner, QrCheckinPanel,
    │                       # PlayerQrCard, NotifySettings, MatchForm, FinanceTrend, ...
    ├── context/            # Auth, I18n, Club, Workspace
    └── lib/                # api.js, i18n/ (vi, en), dates, exportExcel, finance, format, ...
```

---

## 15. API

Mọi route (trừ các route ghi *công khai*) cần header `Authorization: Bearer <access_token Supabase>`. Lỗi trả về dạng `{ "error": "..." }`.

| Nhóm | Route chính |
|---|---|
| Sức khỏe | `GET /health` · `GET /health/schema` (migration nào còn thiếu) |
| Host | `GET /api/host/me` · `GET/PATCH /api/host/subscription` · `POST /api/host/feedback` · `GET/PATCH /api/host/payment-settings` · `GET/PATCH /api/host/notifications` · `POST /api/host/notifications/test` |
| CLB | `GET/POST /api/clubs` (kèm CLB được chia sẻ, trường `role`: `owner` / `co_admin`) · `GET/PATCH/DELETE /api/clubs/:id` · `GET /api/clubs/:id/events` · `POST /api/clubs/:id/join-token/rotate`. `PATCH`, `DELETE` và `rotate` chỉ chủ CLB được gọi (co-admin nhận `403 owner_only`). |
| Thành viên | `GET/POST /api/clubs/:id/members` · `POST …/members/bulk` · `PATCH/DELETE …/members/:mid` · `GET …/members/:mid/history` · `GET /api/clubs/:id/member-requests` · `GET /api/clubs/:id/attendance?from=&to=` · `GET /api/clubs/:id/birthdays?days=3` · `POST …/members/:mid/approve` · `POST …/members/:mid/reject` |
| Gói hội viên | `GET/POST /api/clubs/:id/plans` · `PATCH …/plans/:pid` · `GET/POST …/members/:mid/memberships` · `PATCH/DELETE …/memberships/:msid` · `POST …/memberships/:msid/sessions` · `DELETE …/sessions/last` |
| Thanh toán | `GET /api/clubs/:id/pending-payments` · `POST …/pending-payments/:ref/confirm` |
| Xếp hạng / quỹ | `GET /api/clubs/:id/rankings` · `GET /api/clubs/:id/stats?period=` · `GET /api/clubs/:id/fund` |
| Kho bóng | `GET/POST /api/clubs/:id/inventory` · `PATCH …/inventory/:itemId` · `POST …/:itemId/moves` · `DELETE …/:itemId/moves/:moveId` |
| Sự kiện | `GET/POST /api/events` (trường `kind`: `weekly` / `game` / `training` / `meeting` / `challenge`; `dates: [...]` tạo nhiều buổi một lần) · `GET/PATCH/DELETE /api/events/:id` (`DELETE` trả `409 has_activity` nếu kèo có người/thu chi; thêm `?force=1` để xoá hẳn) · `GET/POST …/participants` · `POST …/participants/import` · `POST …/participants/:pid/:action` (`check-in`, `no-show`, `reset`, `promote`, `cancel`, `waive`, `fee`) · `POST …/checkin-code` (quét QR) · `GET …/finance` · `GET/POST …/scorers` · `GET /api/events/reliability/:memberId` |
| Công khai | `GET /api/events/public/:token` · `GET /api/public/clubs/:token` · `GET /api/public/tickets/:code` (trang vé) · `POST /api/public/telegram` (chỉ Telegram, có secret) |
| Đăng ký kèo (cần đăng nhập) | `GET /api/events/public/:token/me` · `POST …/register` · `POST …/payment-proof` · `POST …/claim-member` |
| Duyệt thanh toán (Host) | `GET /api/events/pending-payments` · `GET /api/events/:id/participants/:pid/proof` · `POST …/participants/:pid/confirm-payment` · `…/reject-payment` · `…/transfer` |
| Trận đấu | `GET/POST /api/matches` · `PATCH/DELETE /api/matches/:id` |
| Giải đấu | `GET/POST /api/tournaments` (`kind`: `pairs` / `team`, `division`, ngày/giờ/địa điểm) · `POST /api/tournaments/pairing` · `POST /api/tournaments/team-builder` · `GET/PATCH/DELETE /api/tournaments/:id` · `PATCH …/matches/:mid` · `PATCH …/sub-matches/:subId` (Team League) · `GET …/fees` · `POST …/fees/:memberId` `{paid}` · `POST …/fees/import` `{from}` · `POST/DELETE …/knockout` |
| Thu chi | `GET/POST /api/transactions` (`?scope=standalone` cho kèo lẻ) · `POST /api/transactions/:id/void` |
| Thống kê | `GET /api/analytics/finance` · `/events-pnl` · `/no-shows` · `/player-form` (`?club_id=` hoặc `?scope=standalone`) |
| Phân quyền | `GET/POST /api/staff-grants` · `PATCH/DELETE /api/staff-grants/:id` |
| Nhân sự | `GET /api/staff/me` · `GET /api/staff/events` · `GET /api/staff/events/:id` · `POST …/participants/:pid/:action` · `POST …/checkin-code` · `POST/PATCH …/matches` |
| Người chơi | `GET /api/player/me` · `PUT /api/player/profile` · `POST /api/player/join/:token` · `GET/DELETE /api/player/payments/:ref` · `POST /api/player/participations/:id/cancel` · `POST /api/player/participations/:id/transfer` · `POST /api/player/checkin-code/rotate` · `POST/DELETE /api/player/telegram(/link)` |

---

## 16. Cơ sở dữ liệu

| Nhóm | Bảng / View |
|---|---|
| Tài khoản | `users` (có `notify_webhook_url`, tài khoản ngân hàng + ảnh QR nhận tiền kèo), `host_subscriptions` (gói + giới hạn, tự tạo khi đăng ký), view `v_host_capacity_usage` |
| CLB | `clubs` (kèm link tham gia, tài khoản ngân hàng), `club_members` (giới tính, năm sinh, `birth_date`, `joined_on`, DUPR, loại, hạng, cờ nội bộ, tài khoản liên kết + `account_verified`, `join_requested`) |
| Hội viên | `membership_plans`, `memberships`, `membership_sessions`, view `v_membership_status` |
| Sự kiện | `events` (có `cancel_deadline_hours`, `kind` loại hoạt động), `event_participants` (có `late_cancel`, `kind` thành viên/khách, `ticket_code` vé QR, `payment_status` + ảnh chuyển khoản, `hold_expires_at` giữ chỗ, `transferred_from`; trạng thái `pending` = đang chờ xác nhận thanh toán), `event_scorers`, `staff_grants` (vai trò `referee` / `coordinator` / `co_admin`), view `v_event_summary`, `v_player_reliability` |
| Thi đấu | `matches` (thuộc CLB **hoặc** kèo; cột `video_url` vẫn giữ nhưng giao diện tạm ẩn), `match_players`, view `v_club_rankings_all_time`, `v_club_rankings_monthly` |
| Giải đấu | `tournaments` (`kind` pairs/team, `division`, ngày/giờ/địa điểm, `win_rule`, `sub_formats`), `tournament_teams`, `tournament_team_members` (đội hình Team League), `tournament_matches` (lượt đấu), `tournament_sub_matches` (trận phụ) |
| Tài chính | `transactions` (sổ chỉ thêm, huỷ thay vì sửa), view `v_club_fund_balance`, `v_event_finance` |
| Kho | `inventory_items`, `inventory_moves` |
| Người chơi | `player_profiles` (có `checkin_token` cho QR, `telegram_chat_id`) |
| Lịch sử | `change_history` (SCD Type 2, ghi bằng trigger) |
| Khác | `feedback` |

---

## 17. Nguyên tắc dữ liệu & bảo mật

- **Mỗi Host chỉ thấy dữ liệu của mình.** Mọi route backend lọc theo `host_id` lấy từ token. Database cũng bật **Row Level Security** làm lớp bảo vệ thứ hai.
- **Service role key chỉ ở backend.** Web chỉ giữ anon key và dùng nó để đăng nhập.
- **Quyền nhân sự theo email đã xác nhận.** Chỉ email Supabase đã xác nhận mới nhận được quyền. Trọng tài và điều phối viên không bao giờ thấy tài chính hay số điện thoại.
- **Đồng quản trị bị giới hạn ở server**, không chỉ ẩn trên giao diện. Họ chỉ truy cập được Thành viên + Tài chính của đúng CLB được cấp. Server chặn xoá CLB, đổi tài khoản nhận tiền, đổi link tham gia và phân quyền. Mọi khoản họ ghi đều nằm trong sổ của chủ CLB.
- **Mã QR check-in** là một token ngẫu nhiên, không chứa thông tin cá nhân. Chỉ Host hoặc điều phối viên của đúng kèo mới dùng được để check-in, và người chơi đổi mã mới bất cứ lúc nào.
- **Webhook thông báo** chỉ nhận URL https công khai (chặn localhost và mạng nội bộ). Bot Telegram chỉ nhận cập nhật có đúng secret.
- **Sổ thu chi chỉ thêm.** Không sửa số tiền, chỉ huỷ kèm lý do. Các khoản tự động gắn với nguồn tạo ra chúng.
- **Lịch sử không ghi đè.** Thay đổi quan trọng được lưu theo dòng thời gian (SCD2).
- **Link công khai** (`/e/…`, `/join/…`) dùng token ngẫu nhiên, có thể tắt hoặc tạo mới. Trang công khai không lộ số điện thoại.

---

## 18. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Web báo lỗi mạng / `Failed to fetch` | Kiểm tra `NEXT_PUBLIC_API_URL` và `/health` của backend. Kiểm tra `CORS_ORIGIN` có đúng domain web không. |
| Lần mở đầu tiên trong ngày rất chậm (30–60 giây) | Render free đang "ngủ". Cài cron-job.org gọi `/health` mỗi 10 phút (xem [11.1](#111-giữ-backend-render-luôn-thức-miễn-phí)). |
| `401 Invalid or expired session` | Đăng xuất rồi đăng nhập lại. Kiểm tra backend và web dùng **cùng** project Supabase. |
| Link kèo báo "Không tìm thấy kèo" / "Không tải được kèo" ngay sau khi cập nhật code | Database chưa chạy migration mới. Trong app, Host sẽ thấy khung đỏ **"Database chưa được cập nhật"** ghi đúng tên file cần chạy. Hoặc mở `https://<backend>.onrender.com/health/schema` để xem `missing_migrations`. Dán file đó vào Supabase SQL Editor rồi bấm Run. |
| Lỗi kiểu `column … does not exist` sau khi cập nhật code | Database chưa được cập nhật. Chạy `supabase db push` (xem [11.2](#112-cập-nhật-database-production-bằng-migration-supabase-cli)), hoặc chạy lại `database/schema.sql` nếu chưa có dữ liệu thật. |
| Nút *Quét QR* không mở được camera | Camera chỉ chạy trên **https** và cần cho phép quyền camera trong trình duyệt. Nếu vẫn không được, dán mã `PBP:…` vào ô bên dưới camera. |
| Quét QR báo "Không có tên trong kèo" | Người chơi chưa đăng ký kèo này (hoặc đăng ký bằng số điện thoại khác mà không đăng nhập). Hãy thêm họ vào kèo trước. |
| Người chơi không nhận được tin Telegram | Kiểm tra 3 biến `TELEGRAM_*` trên Render, đã chạy `npm run telegram:webhook`, và người chơi đã bấm *Start* (Cổng người chơi hiện "Đã kết nối ✓"). |
| Đăng ký tài khoản mới báo **"Database error saving new user"** | Một trigger trên `auth.users` bị lỗi. Chạy migration `20261003090000_signup_safety_member_dates.sql` (trigger của app không còn làm hỏng việc đăng ký). Nếu vẫn lỗi, trong Supabase SQL Editor chạy `select tgname, tgfoid::regproc from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;` — trigger nào **không phải** `trg_new_auth_user` (VD `on_auth_user_created` tạo từ mẫu Supabase) thì xoá: `drop trigger <tên> on auth.users;`. Xem lỗi chi tiết ở **Logs → Postgres**. |
| Người chơi không đăng ký được như thành viên | Tài khoản chưa được Host xác thực: vào **Thành viên** → bấm tên → **Xác thực**. Số điện thoại trong hồ sơ người chơi phải trùng số trong danh sách thành viên thì nút "Tôi là thành viên" mới tìm được. |
| Khách chuyển khoản rồi nhưng chỗ bị huỷ | Quá 30 phút (hoặc 2 giờ sau khi bị từ chối) mà chưa gửi ảnh thì chỗ tự nhả. Host thêm tay người đó rồi bấm *Đã thu tiền mặt* / *đã thu phí*. |
| Trang thanh toán không hiện VietQR | Chưa cài tài khoản nhận tiền: **Tài khoản → Tài khoản nhận tiền (kèo)**, hoặc tài khoản của CLB trong *CLB của tôi → Thanh toán*. |
| Đồng quản trị không thấy CLB | Họ phải đăng nhập bằng **đúng email** được cấp, **xác nhận email**, rồi chọn workspace **Club**. |
| `Capacity limit reached` | Đã chạm giới hạn gói (xem [8.4](#84-gói-dịch-vụ--giới-hạn)). Nâng gói hoặc cho thành viên cũ ngừng hoạt động. |
| Đăng ký xong không đăng nhập được | Mở email và bấm link xác nhận. Kiểm tra *Site URL* trong Supabase Auth. |
| Trọng tài không thấy kèo được giao | Người đó phải đăng nhập bằng **đúng email** được cấp, **xác nhận email**, rồi chọn workspace *Trọng tài / Điều phối*. |
| Người chơi không thấy mã QR **chuyển khoản** | Host chưa nhập mã ngân hàng và số tài khoản trong *CLB của tôi → Thanh toán & link tham gia*. |
| Không nhận được email góp ý | Với `onboarding@resend.dev`, `FEEDBACK_TO_EMAIL` phải là email tài khoản Resend. Xem log Render. Hoặc dùng cách webhook. |
| Không huỷ được một khoản trong Sổ thu chi | Đó là khoản *tự động*. Sửa tại nơi tạo ra nó: gói hội viên, kho bóng, hoặc trạng thái thu phí trong kèo. |
