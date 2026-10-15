-- Liên kết tài khoản với thành viên Host đã nhập tay (khi SĐT không khớp):
--  * kind = 'link'    — link riêng cho một thành viên (Host gửi qua Zalo); ai mở link và đăng
--                       nhập sẽ được gắn vào đúng dòng đó. Chỉ lưu mã băm của link, dùng một lần.
--  * kind = 'request' — Host gõ tên đăng nhập / email của người chơi; người đó xác nhận
--                       (hoặc từ chối) trong trang của họ.
-- merge_club_member(): gộp một dòng "xin gia nhập" vào dòng thành viên Host đã nhập
-- (chuyển mọi dữ liệu đang trỏ tới dòng cũ sang dòng mới rồi xoá dòng cũ).
create table if not exists public.member_link_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  club_member_id uuid not null references public.club_members(id) on delete cascade,
  kind text not null check (kind in ('link', 'request')),
  token_hash text unique,
  target_user_id uuid references public.users(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users(id) on delete set null,
  declined_at timestamptz,
  check ((kind = 'link' and token_hash is not null) or (kind = 'request' and target_user_id is not null))
);
create index if not exists member_link_invites_member_idx on public.member_link_invites (club_member_id);
create index if not exists member_link_invites_target_idx on public.member_link_invites (target_user_id) where used_at is null and declined_at is null;

alter table public.member_link_invites enable row level security;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.member_link_invites from %I', r);
    end if;
  end loop;
end $$;

create or replace function public.merge_club_member(p_source uuid, p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  if p_source = p_target then
    return;
  end if;
  if (select club_id from public.club_members where id = p_source) is distinct from (select club_id from public.club_members where id = p_target) then
    raise exception 'members are in different clubs';
  end if;
  -- Every single-column foreign key to club_members: point it at the target. A row the
  -- target already has (unique clash) stays behind and goes with the source.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = 'public.club_members'::regclass and array_length(c.conkey, 1) = 1
  loop
    begin
      execute format('update %s set %I = $1 where %I = $2', r.tbl, r.col, r.col) using p_target, p_source;
    exception when unique_violation then
      null;
    end;
  end loop;
  delete from public.club_members where id = p_source;
end $$;

revoke all on function public.merge_club_member(uuid, uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on function public.merge_club_member(uuid, uuid) from %I', r);
    end if;
  end loop;
end $$;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.merge_club_member(uuid, uuid) to service_role; -- the API server only
  end if;
end $$;

notify pgrst, 'reload schema';
