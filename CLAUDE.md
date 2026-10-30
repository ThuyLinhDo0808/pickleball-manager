# Hướng dẫn cho Claude / AI khi làm việc trên repo này

## Quy tắc bắt buộc: luôn cập nhật README

**Mỗi khi thay đổi web** — thêm tính năng mới, sửa hay bỏ tính năng, đổi giao diện/menu/đường dẫn,
thêm route API, thêm migration hoặc biến môi trường — **phải cập nhật `README.md` trong cùng commit/push**.

Kiểm tra các mục liên quan trong README:
- §3 Không gian làm việc / menu, §4–§8 mô tả tính năng (đúng trang, đúng đường dẫn)
- §11.2 danh sách migration (`supabase/migrations/`)
- §12 biến môi trường (backend + web)
- §15 API, §16 cơ sở dữ liệu, §17 bảo mật/phân quyền, §18 xử lý sự cố

README viết bằng tiếng Việt, mô tả theo góc nhìn người dùng.

## Quy tắc giao diện (UI/UX)
- Dùng taste-skill (phần app-screens) để thiết kế, ui-ux-pro-max để kiểm tra trải nghiệm. Ưu tiên: CLAUDE.md > taste-skill > ui-ux-pro-max.
- **Trang giới thiệu "/" và trang đăng nhập giữ nguyên hiệu ứng đặc trưng** (chữ lấp lánh, đốm sáng, nút phát sáng, con trỏ riêng, dải sáng quét, số cảnh lớn, nhãn IN HOA đánh số, bóng, kính mờ). Không áp dụng các quy tắc "bỏ trang trí" của skill cho 2 trang này.
- **Font:** máy tính dùng font hệ thống (Segoe UI…), điện thoại (<640px) dùng Plus Jakarta Sans — qua biến `--font-app` trong `web/app/globals.css`. Trang giới thiệu dùng Plus Jakarta Sans ở mọi khổ.
- Giữ màu NexusZone (navy + xanh chanh); màu nhấn chỉ cho nút chính và dữ liệu quan trọng.
- Đẹp ở 1440px và 390px: không tràn ngang, không chồng chéo, không cắt chữ "…".
- Điện thoại: vùng bấm ≥44px, chữ nội dung ≥14px, bảng nhiều cột thành danh sách 2 dòng.
- Không dùng emoji làm biểu tượng (dùng `web/components/ui/UiIcon.js` hoặc chữ).
- Số căn phải, `tabular-nums`; trống là "—" màu xám.
- Nút chính bên phải; hướng dẫn dạng popup (i).
- Có thiết kế cho trạng thái trống / đang tải / lỗi.
- Chỉ sửa giao diện thì không đổi tính năng, API, đường dẫn.
- Mỗi đợt: chạy `npm run build` trong `web/`, chụp trước/sau ở 1440px và 390px, cập nhật README và `docs/ui-plan.md`.

## Quy ước khác
- Trả lời người dùng bằng tiếng Việt.
- Thay đổi schema: tạo file trong `supabase/migrations/`, chép cùng nội dung vào `database/schema.sql`,
  và thêm kiểm tra vào `backend/src/services/schemaCheck.js`.
- Bảng thành viên: bảng thật là `club_members_all`; `club_members` là VIEW (chỉ người chưa xoá mềm).
  Thêm cột: `alter table public.club_members_all …` rồi tạo lại view `public.club_members`
  (`select * from public.club_members_all where deleted_at is null`), không ALTER `club_members`.
- Chữ trên giao diện đi qua i18n: thêm khoá vào cả `web/lib/i18n/vi.js` và `web/lib/i18n/en.js`.
- Không commit secret/key thật; không force push.
