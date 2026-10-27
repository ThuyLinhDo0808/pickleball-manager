-- "Tính tài chính từ ngày": mọi khoản thu / chi (quỹ CLB và tiền theo buổi) trước ngày này
-- không được cộng vào số dư, biểu đồ hay sổ thu chi (vẫn giữ trong cơ sở dữ liệu, xem được
-- khi bấm "Hiện khoản trước ngày bắt đầu"). Dùng khi chạy thử xong và muốn bắt đầu sổ sạch.
-- Safe to run more than once.
alter table public.clubs add column if not exists finance_from date;
