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
6. [Trọng tài / Điều phối viên](#6-trọng-tài--điều-phối-viên)
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
| **Chủ nhiệm CLB** | Quản lý thành viên, bán gói tháng/quý/năm và trừ buổi tự động khi check-in. Xếp lịch chơi định kỳ, nhập trận đấu, xếp hạng và vinh danh, tổ chức giải nội bộ, quản lý quỹ, kho bóng và thống kê. |
| **Người mở kèo lẻ (Xé Vé)** | Tạo kèo và gửi link đăng ký vào nhóm Zalo/Telegram. App tự xếp danh sách chính / danh sách chờ, hỗ trợ check-in, đánh dấu vắng, thu phí, tính lãi/lỗ từng kèo và xuất Excel. |
| **Trọng tài / điều phối viên** | Đăng nhập bằng tài khoản riêng để check-in người chơi và nhập tỷ số của các kèo được giao. Không thấy tài chính hay số điện thoại. |
| **Người chơi** | Đăng ký kèo qua link, tham gia CLB, chuyển khoản bằng mã QR. Xem số buổi còn lại, công nợ, lịch sử tham gia, phong độ và biến động DUPR. |

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
| **Club Manager** | Cộng đồng chơi lâu dài | Tổng quan · Thành viên · **Thi đấu ▸** (Lịch, Trận đấu, Xếp hạng, Giải đấu, Thống kê) · **Tài chính ▸** (Tổng quan, Sổ thu chi, Gói hội viên, Kho bóng) · **Cài đặt ▸** (CLB của tôi, Phân quyền, Tài khoản) |
| **Xé Vé Manager** | Kèo lẻ, giải phong trào | Kèo Xé Vé · Thống kê · **Tài chính ▸** (Tổng quan, Sổ thu chi) · **Cài đặt ▸** (Phân quyền, Tài khoản) |
| **Trọng tài / Điều phối** | Người được Host giao việc | Kèo được giao |
| **Tôi là người chơi** | Người chơi | Của tôi · Hồ sơ |

**Menu:**
- Trên máy tính, menu bên trái chia theo **nhóm (segment)**. Mỗi nhóm thu gọn/mở rộng được, app nhớ trạng thái. Nhóm chứa trang đang mở tự bung ra.
- Nút mũi tên thu menu lại thành dải icon.
- Trên điện thoại có thanh dưới: *Tổng quan · Thành viên · Lịch · Tài chính · Thêm*. Nút **Thêm** mở toàn bộ menu theo nhóm.

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
- Sửa thông tin.
- **Gói hội viên** của người đó: đăng ký gói, đánh dấu đã đóng/chưa đóng, trừ hoặc hoàn buổi thủ công.
- **Ghi chú nội bộ** (chỉ Host thấy): cờ *Chưa đóng tiền*, *Hay đi trễ*, *Ý thức kém*, cùng ghi chú tự do.
- **Tài khoản người chơi** đã liên kết (nếu người đó tự tham gia qua link). Host có thể huỷ liên kết.
- **Lịch sử thay đổi**: DUPR, loại, hạng, trạng thái hoạt động, trạng thái thanh toán gói. Xem [4.11](#411-lịch-sử-thay-đổi-scd-type-2).

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

### 4.5. Lịch buổi chơi (`/events` khi ở workspace Club)
- Tạo buổi gồm tên, ngày, giờ, địa điểm, số sân, số chỗ, khoảng DUPR, phí, hạn đăng ký và thông báo cho người chơi.
- **Lặp lại hằng tuần**: nhập số buổi (1–26), app tạo sẵn các tuần liên tiếp.
- Trang chi tiết buổi giống kèo Xé Vé (xem [mục 5](#5-tính-năng-chi-tiết--xé-vé-manager)), cộng thêm:
  - **Nhập từ CLB**: chọn thành viên đưa vào buổi.
  - **Check-in một hội viên sẽ tự trừ 1 buổi** trong gói còn hiệu lực. App báo "đã trừ 1 buổi, còn n buổi", hoặc "gói không giới hạn", hoặc "không có gói còn hiệu lực". Huỷ check-in thì buổi được hoàn lại. Mỗi buổi chỉ trừ tối đa 1 lần.

### 4.6. Trận đấu (`/club/matches`)
- **Nhập trận** theo thể thức Đơn, Đôi hoặc Đôi nam nữ (mỗi đội 1 nam + 1 nữ). Mỗi trận gồm người chơi 2 đội, tỷ số, thời gian và **link YouTube** (không bắt buộc).
- Có video thì xem được ngay trong app.
- Sửa tỷ số/video hoặc xoá trận. Bảng xếp hạng tự tính lại.
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

**Tạo giải:**
1. Đặt tên giải và chọn nội dung (đơn / đôi / đôi nam nữ).
2. Chọn người chơi.
3. **Ghép cặp**:
   - *Cân bằng*: người trình độ cao ghép với người thấp hơn để các đội đều sức. Người chưa có DUPR được tính là 3.0.
   - *Ngẫu nhiên*.
   - Sau khi ghép vẫn sửa được từng cặp, thêm hoặc bỏ đội.
4. Chọn thể thức:
   - **Vòng bảng → loại trực tiếp**: chọn số bảng và số đội mỗi bảng đi tiếp. Các đội được chia bảng theo kiểu "rắn" để các bảng cân sức.
   - **Chỉ loại trực tiếp**.
5. Bấm **Tạo giải & xếp lịch**. App tự sinh lịch vòng tròn trong mỗi bảng.

**Trong giải:**
- Nhập tỷ số từng trận. Bảng xếp hạng vòng bảng tính theo thắng và hiệu số.
- Nhập xong vòng bảng thì bấm **Tạo vòng loại trực tiếp**. Đội hạt giống cao được **miễn đấu** nếu số đội không tròn, người thắng tự vào vòng sau. Các vòng hiển thị là tứ kết, bán kết, chung kết, rồi đến **Vô địch**.
- Có thể *Làm lại vòng loại trực tiếp* mà vẫn giữ kết quả vòng bảng, hoặc xoá kết quả một trận.

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

### 4.13. Thống kê (`/analytics`)
- **Tỷ lệ vắng mặt theo khung giờ**: heatmap *thứ trong tuần × khung giờ bắt đầu*, tính trên các buổi đã qua trong những tháng gần đây. Ô càng sáng thì khung giờ đó càng hay bị "bùng" kèo, giúp chọn giờ mở kèo.
- **Phong độ theo thời gian** của một thành viên: tỷ lệ thắng và hiệu số theo từng tháng.

(Biểu đồ tiền nằm ở **Tài chính → Tổng quan**.)

---

## 5. Tính năng chi tiết — Xé Vé Manager

### 5.1. Tạo kèo (`/events`)
- Tên kèo, ngày, giờ bắt đầu/kết thúc, địa điểm, số sân, **số chỗ**, DUPR từ–đến, phí, **hạn đăng ký**, **thông báo cho người chơi** (ví dụ: mang nước, sân số 3, chuyển khoản trước 20h…).
- Trạng thái: *Nháp → Đang mở → Đã đóng → Đã xong*, hoặc *Đã huỷ*.

### 5.2. Link đăng ký công khai (`/e/<token>`)
- Bật **Cho phép đăng ký qua link**, rồi *Copy link* hoặc *Chia sẻ* vào nhóm Zalo/Telegram.
- Người chơi **không cần tài khoản**. Trang đăng ký hiện:
  - thông tin kèo và thông báo của Host;
  - phí và trình độ;
  - số chỗ còn;
  - danh sách người đã đăng ký.
- Người chơi nhập họ tên, số điện thoại và DUPR (không bắt buộc). **Số điện thoại chỉ Host thấy.**
- Hết chỗ thì người đăng ký vào **danh sách chờ**. Một số điện thoại chỉ đăng ký được một lần mỗi kèo.
- Link bị chặn khi kèo tắt đăng ký, không ở trạng thái *Đang mở* hoặc đã quá hạn.
- Nếu người chơi đang đăng nhập, lượt đăng ký được gắn vào tài khoản và hiện trong lịch sử của họ.

### 5.3. Quản lý người chơi trong kèo (`/events/<id>`)
- **Danh sách chính** và **danh sách chờ**. Thêm tay, hoặc nhập từ CLB (workspace Club).
- Thao tác từng người:
  - **Check-in**
  - **Vắng mặt**
  - **Hoàn tác**
  - **Đưa lên danh sách chính**
  - **Huỷ đăng ký**
  - Bật/tắt **đã thu phí**
- Khi một người trong danh sách chính huỷ, người đầu tiên trong danh sách chờ **tự được đưa lên**.
- Nhập trận đấu của kèo ngay trong trang.

### 5.4. Tài chính của kèo
- Thêm khoản thu/chi cho kèo (tiền sân, bóng, nước…).
- Tick *đã thu phí* thì app tự ghi khoản **Phí kèo**. Bỏ tick thì khoản đó tự bị huỷ.
- Xem thu, chi và **lợi nhuận ròng** của kèo.
- **Xuất Excel** gồm 2 sheet: *Participants* (người chơi + trạng thái phí) và *Transactions* (thu chi, có **công thức SUM sống**, sửa trong Excel/Sheets thì tổng tự tính lại).
- Tổng hợp mọi kèo: **Tài chính → Tổng quan** (lãi/lỗ từng kèo) và **Sổ thu chi** (mọi khoản của các kèo lẻ, có link về kèo).

---

## 6. Trọng tài / Điều phối viên

### 6.1. Host cấp quyền (`/staff-access`)
- Nhập **email** của người đó, tên (để dễ nhận ra) và **vai trò**:
  - **Trọng tài**: chỉ nhập tỷ số trận đấu.
  - **Điều phối viên**: check-in người chơi và nhập tỷ số.
- **Phạm vi**: một kèo, mọi buổi của một CLB, hoặc tất cả kèo của Host.
- Thu hồi quyền bất cứ lúc nào.

### 6.2. Người được cấp quyền (`/staff`)
1. Đăng nhập (hoặc đăng ký) bằng **đúng email** được cấp và **xác nhận email**.
2. Chọn workspace **Trọng tài / Điều phối** → *Kèo được giao*.
3. Trong từng kèo có hai tab:
   - **Check-in**: tìm tên, bấm *Đã đến* hoặc *Vắng*, hoàn tác được, có đếm "x/y đã đến".
   - **Tỷ số**: nhập hoặc sửa trận.

Họ **không bao giờ thấy tài chính hay số điện thoại**. Check-in của điều phối viên cũng tự trừ buổi trong gói hội viên như khi Host check-in.

---

## 7. Cổng người chơi

Người chơi dùng chung app, chọn workspace **Tôi là người chơi** (`/p`).

- **Hồ sơ** (`/p/profile`): ảnh đại diện, họ tên, số điện thoại, DUPR, giới tính, năm sinh.
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
  - **Lịch sử tham gia**: đã đăng ký / danh sách chờ / đã chơi / vắng / đã huỷ.
  - **Phong độ 12 tháng**: số trận, số thắng, tỷ lệ thắng, số buổi đã chơi.
  - Biểu đồ **biến động DUPR** (mỗi lần DUPR đổi đều được lưu lại).

---

## 8. Tính năng chung

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

---

## 9. Hướng dẫn nhanh theo tình huống

### Mở CLB mới và thu tiền hội viên
1. **Cài đặt → CLB của tôi → Tạo CLB.**
2. **Tài chính → Gói hội viên**: tạo gói, ví dụ "Gói tháng", chu kỳ Tháng, 500.000₫, 8 buổi.
3. **Thành viên → ＋**: thêm thành viên (hoặc để người chơi tự tham gia ở bước 4).
4. **CLB của tôi → Thanh toán & link tham gia**: nhập tài khoản ngân hàng, bật đăng ký qua link, gửi link vào nhóm.
5. Người chơi đăng ký và chuyển khoản bằng QR. Host vào **Tài chính → Tổng quan → Chờ xác nhận** và bấm *Đã nhận tiền*.

### Chơi định kỳ hằng tuần
1. **Thi đấu → Lịch → Tạo sự kiện mới**, đặt *Lặp lại hằng tuần* = 4 để có 4 tuần.
2. Mỗi buổi: **Nhập từ CLB** (hoặc mở link đăng ký), đến giờ thì **Check-in**. App tự trừ buổi trong gói.
3. Nhập trận (kèm link YouTube nếu có). Cuối tháng xem **Xếp hạng → Tháng → Vinh danh**.

### Mở một kèo Xé Vé
1. Chuyển workspace sang **Xé Vé**, chọn **Tạo sự kiện mới** (điền số chỗ, phí, hạn đăng ký, thông báo).
2. Bật *Cho phép đăng ký qua link*, *Chia sẻ* vào nhóm, rồi đổi trạng thái sang **Đang mở**.
3. Tại sân: check-in, đánh dấu vắng, tick *đã thu phí*, thêm khoản chi tiền sân và bóng.
4. Xem lãi/lỗ, **Xuất Excel** nếu cần. Chuyển kèo sang **Đã xong**.
5. (Tuỳ chọn) **Cài đặt → Phân quyền**: giao kèo cho một điều phối viên check-in thay mình.

### Tổ chức giải nội bộ
**Thi đấu → Giải đấu → Tạo giải** → chọn người chơi → *Ghép cặp cân bằng* → 2 bảng, mỗi bảng 2 đội đi tiếp → *Tạo giải & xếp lịch* → nhập tỷ số vòng bảng → *Tạo vòng loại trực tiếp* → nhập tỷ số đến chung kết.

### Theo dõi chi phí bóng
**Tài chính → Kho bóng** → thêm loại bóng → *Nhập hàng* (tick ghi vào chi quỹ) → mỗi lần bỏ bóng thì ghi *Bóng hỏng/thay* kèm số buổi đã dùng → xem bảng so sánh **chi phí / quả / buổi**.

---

## 10. Cài đặt & chạy trên máy

**Cần có:** Node.js **18+** (khuyên dùng 20/22), npm, và một project **Supabase** (gói free là đủ).

### Bước 1 — Database
1. Tạo project trên https://supabase.com.
2. Mở **SQL Editor**, dán toàn bộ `database/schema.sql` rồi bấm **Run**. File này chạy lại nhiều lần vẫn an toàn. Mỗi khi kéo code mới về, hãy chạy lại để cập nhật bảng, view và trigger.
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
   - Gói free của Render "ngủ" sau một thời gian không dùng, nên request đầu tiên có thể chậm khoảng 30–60 giây.
3. **Web → Vercel**:
   - New Project, import repo, đặt **Root Directory** là `web`.
   - Thêm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL` (URL Render).
   - Bấm Deploy.
   - Biến `NEXT_PUBLIC_*` được nhúng lúc build, nên đổi biến thì phải **Redeploy**.
4. Cập nhật **Supabase → Authentication → URL Configuration** với domain Vercel.

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
│   └── schema.sql              # toàn bộ schema: bảng, enum, view, trigger, RLS
├── backend/
│   ├── render.yaml             # cấu hình deploy Render
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
│       │   ├── attendance.js   #   check-in / vắng / hoàn tác (Host + điều phối)
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
    │   ├── events/   (lịch & kèo) + [eventId]/
    │   ├── finance/  (tổng quan) ledger/ plans/ inventory/
    │   ├── analytics/
    │   ├── staff/    (trọng tài/điều phối)
    │   ├── p/        (cổng người chơi) profile/
    │   ├── e/[token]/     # trang đăng ký kèo công khai
    │   └── join/[token]/  # trang tham gia CLB
    ├── components/         # AppShell (menu), PlayerShell, MatchForm, FinanceTrend, ...
    ├── context/            # Auth, I18n, Club, Workspace
    └── lib/                # api.js, i18n/ (vi, en), exportExcel, finance, format, ...
```

---

## 15. API

Mọi route (trừ các route ghi *công khai*) cần header `Authorization: Bearer <access_token Supabase>`. Lỗi trả về dạng `{ "error": "..." }`.

| Nhóm | Route chính |
|---|---|
| Sức khỏe | `GET /health` |
| Host | `GET /api/host/me` · `GET/PATCH /api/host/subscription` · `POST /api/host/feedback` |
| CLB | `GET/POST /api/clubs` · `GET/PATCH/DELETE /api/clubs/:id` · `GET /api/clubs/:id/events` · `POST /api/clubs/:id/join-token/rotate` |
| Thành viên | `GET/POST /api/clubs/:id/members` · `POST …/members/bulk` · `PATCH/DELETE …/members/:mid` · `GET …/members/:mid/history` |
| Gói hội viên | `GET/POST /api/clubs/:id/plans` · `PATCH …/plans/:pid` · `GET/POST …/members/:mid/memberships` · `PATCH/DELETE …/memberships/:msid` · `POST …/memberships/:msid/sessions` · `DELETE …/sessions/last` |
| Thanh toán | `GET /api/clubs/:id/pending-payments` · `POST …/pending-payments/:ref/confirm` |
| Xếp hạng / quỹ | `GET /api/clubs/:id/rankings` · `GET /api/clubs/:id/stats?period=` · `GET /api/clubs/:id/fund` |
| Kho bóng | `GET/POST /api/clubs/:id/inventory` · `PATCH …/inventory/:itemId` · `POST …/:itemId/moves` · `DELETE …/:itemId/moves/:moveId` |
| Sự kiện | `GET/POST /api/events` · `GET/PATCH/DELETE /api/events/:id` · `GET/POST …/participants` · `POST …/participants/import` · `POST …/participants/:pid/:action` (`check-in`, `no-show`, `reset`, `promote`, `cancel`, `fee`) · `GET …/finance` · `GET/POST …/scorers` · `GET /api/events/reliability/:memberId` |
| Công khai | `GET /api/events/public/:token` · `POST /api/events/public/:token/register` · `GET /api/public/clubs/:token` |
| Trận đấu | `GET/POST /api/matches` · `PATCH/DELETE /api/matches/:id` |
| Giải đấu | `GET/POST /api/tournaments` · `POST /api/tournaments/pairing` · `GET/DELETE /api/tournaments/:id` · `PATCH …/matches/:mid` · `POST/DELETE …/knockout` |
| Thu chi | `GET/POST /api/transactions` (`?scope=standalone` cho kèo lẻ) · `POST /api/transactions/:id/void` |
| Thống kê | `GET /api/analytics/finance` · `/events-pnl` · `/no-shows` · `/player-form` (`?club_id=` hoặc `?scope=standalone`) |
| Phân quyền | `GET/POST /api/staff-grants` · `PATCH/DELETE /api/staff-grants/:id` |
| Nhân sự | `GET /api/staff/me` · `GET /api/staff/events` · `GET /api/staff/events/:id` · `POST …/participants/:pid/:action` · `POST/PATCH …/matches` |
| Người chơi | `GET /api/player/me` · `PUT /api/player/profile` · `POST /api/player/join/:token` · `GET/DELETE /api/player/payments/:ref` |

---

## 16. Cơ sở dữ liệu

| Nhóm | Bảng / View |
|---|---|
| Tài khoản | `users`, `host_subscriptions` (gói + giới hạn, tự tạo khi đăng ký), view `v_host_capacity_usage` |
| CLB | `clubs` (kèm link tham gia, tài khoản ngân hàng), `club_members` (giới tính, năm sinh, DUPR, loại, hạng, cờ nội bộ, tài khoản liên kết) |
| Hội viên | `membership_plans`, `memberships`, `membership_sessions`, view `v_membership_status` |
| Sự kiện | `events`, `event_participants`, `event_scorers`, `staff_grants`, view `v_event_summary`, `v_player_reliability` |
| Thi đấu | `matches` (thuộc CLB **hoặc** kèo, có `video_url`), `match_players`, view `v_club_rankings_all_time`, `v_club_rankings_monthly` |
| Giải đấu | `tournaments`, `tournament_teams`, `tournament_matches` |
| Tài chính | `transactions` (sổ chỉ thêm, huỷ thay vì sửa), view `v_club_fund_balance`, `v_event_finance` |
| Kho | `inventory_items`, `inventory_moves` |
| Người chơi | `player_profiles` |
| Lịch sử | `change_history` (SCD Type 2, ghi bằng trigger) |
| Khác | `feedback` |

---

## 17. Nguyên tắc dữ liệu & bảo mật

- **Mỗi Host chỉ thấy dữ liệu của mình.** Mọi route backend lọc theo `host_id` lấy từ token. Database cũng bật **Row Level Security** làm lớp bảo vệ thứ hai.
- **Service role key chỉ ở backend.** Web chỉ giữ anon key và dùng nó để đăng nhập.
- **Quyền nhân sự theo email đã xác nhận.** Chỉ email Supabase đã xác nhận mới nhận được quyền. Trọng tài và điều phối viên không bao giờ thấy tài chính hay số điện thoại.
- **Sổ thu chi chỉ thêm.** Không sửa số tiền, chỉ huỷ kèm lý do. Các khoản tự động gắn với nguồn tạo ra chúng.
- **Lịch sử không ghi đè.** Thay đổi quan trọng được lưu theo dòng thời gian (SCD2).
- **Link công khai** (`/e/…`, `/join/…`) dùng token ngẫu nhiên, có thể tắt hoặc tạo mới. Trang công khai không lộ số điện thoại.

---

## 18. Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| Web báo lỗi mạng / `Failed to fetch` | Kiểm tra `NEXT_PUBLIC_API_URL` và `/health` của backend. Kiểm tra `CORS_ORIGIN` có đúng domain web không. Render free có thể đang "ngủ", hãy đợi khoảng 30–60 giây. |
| `401 Invalid or expired session` | Đăng xuất rồi đăng nhập lại. Kiểm tra backend và web dùng **cùng** project Supabase. |
| Lỗi kiểu `column … does not exist` sau khi cập nhật code | Chạy lại `database/schema.sql` trong Supabase SQL Editor. |
| `Capacity limit reached` | Đã chạm giới hạn gói (xem [8.4](#84-gói-dịch-vụ--giới-hạn)). Nâng gói hoặc cho thành viên cũ ngừng hoạt động. |
| Đăng ký xong không đăng nhập được | Mở email và bấm link xác nhận. Kiểm tra *Site URL* trong Supabase Auth. |
| Trọng tài không thấy kèo được giao | Người đó phải đăng nhập bằng **đúng email** được cấp, **xác nhận email**, rồi chọn workspace *Trọng tài / Điều phối*. |
| Người chơi không thấy mã QR | Host chưa nhập mã ngân hàng và số tài khoản trong *CLB của tôi → Thanh toán & link tham gia*. |
| Không nhận được email góp ý | Với `onboarding@resend.dev`, `FEEDBACK_TO_EMAIL` phải là email tài khoản Resend. Xem log Render. Hoặc dùng cách webhook. |
| Không huỷ được một khoản trong Sổ thu chi | Đó là khoản *tự động*. Sửa tại nơi tạo ra nó: gói hội viên, kho bóng, hoặc trạng thái thu phí trong kèo. |
