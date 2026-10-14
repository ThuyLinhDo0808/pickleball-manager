-- Liên kết DUPR (không cần API): người chơi khai DUPR ID, Host nhập file thành viên của
-- DUPR Club để cập nhật điểm, và xuất trận ra file theo mẫu "Import Matches via CSV".
alter table public.clubs add column if not exists dupr_club_id text
  check (dupr_club_id is null or char_length(dupr_club_id) between 1 and 40);

alter table public.player_profiles add column if not exists dupr_id text
  check (dupr_id is null or dupr_id ~ '^[A-Z0-9]{4,10}$');

alter table public.club_members add column if not exists dupr_id text
  check (dupr_id is null or dupr_id ~ '^[A-Z0-9]{4,10}$');
alter table public.club_members add column if not exists dupr_name text;            -- tên trên DUPR (để đối chiếu)
alter table public.club_members add column if not exists dupr_doubles numeric(5,3);  -- null = chưa có điểm (NR)
alter table public.club_members add column if not exists dupr_doubles_rel smallint;   -- độ tin cậy 0-100
alter table public.club_members add column if not exists dupr_singles numeric(5,3);
alter table public.club_members add column if not exists dupr_singles_rel smallint;
alter table public.club_members add column if not exists dupr_synced_at timestamptz;  -- lần nhập file gần nhất
alter table public.club_members add column if not exists dupr_verified_at timestamptz; -- Host đã xác nhận đúng người
create unique index if not exists club_members_dupr_id_uq on public.club_members (club_id, dupr_id) where dupr_id is not null;

-- Trận đã xuất sang DUPR (để lần sau không xuất trùng).
alter table public.matches add column if not exists dupr_exported_at timestamptz;
alter table public.tournament_matches add column if not exists dupr_exported_at timestamptz;
alter table public.tournament_sub_matches add column if not exists dupr_exported_at timestamptz;

notify pgrst, 'reload schema';
