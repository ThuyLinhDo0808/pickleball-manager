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

## Quy ước khác
- Trả lời người dùng bằng tiếng Việt.
- Thay đổi schema: tạo file trong `supabase/migrations/`, chép cùng nội dung vào `database/schema.sql`,
  và thêm kiểm tra vào `backend/src/services/schemaCheck.js`.
- Chữ trên giao diện đi qua i18n: thêm khoá vào cả `web/lib/i18n/vi.js` và `web/lib/i18n/en.js`.
- Không commit secret/key thật; không force push.
