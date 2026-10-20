-- SĐT liên hệ của Host (Tài khoản → Thông tin liên hệ): hiện cho người chơi ở link đặt chỗ
-- nhanh và trang đặt chỗ, để người không muốn để lại SĐT liên hệ Host khi tham gia / pass vé.
alter table public.users add column if not exists contact_phone text
  check (contact_phone is null or char_length(contact_phone) <= 20);

notify pgrst, 'reload schema';
