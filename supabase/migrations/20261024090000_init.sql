-- ブチョンの物語 — 로그인/회원관리/접속자 추적 스키마 (Supabase)
-- Supabase 대시보드 → SQL Editor 에 전체 붙여넣고 RUN 하세요.
-- 최고관리자 이메일: kr.seunghunyeo@gmail.com (해당 이메일로 가입하면 자동으로 admin+승인)

-- ===== 1) 프로필 (회원) =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  role text not null default 'user',       -- 'admin' | 'user'
  status text not null default 'pending',   -- 'pending' | 'approved' | 'rejected'
  blocked boolean not null default false,   -- 관리자의 접속 해지(차단)
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ===== 2) 접속 세션(접속자: IP/국적) =====
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  name text,
  ip text,
  country text,
  country_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
alter table public.sessions enable row level security;

-- ===== 3) 관리자 판별 함수 =====
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ===== 4) 신규 가입 시 프로필 자동 생성 (관리자 이메일은 자동 승인) =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, email, name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    case when new.email = 'kr.seunghunyeo@gmail.com' then 'admin' else 'user' end,
    case when new.email = 'kr.seunghunyeo@gmail.com' then 'approved' else 'pending' end
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== 5) RLS 정책 =====
-- profiles: 본인 읽기/수정, 관리자 전체 읽기/수정
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- sessions: 본인 추가/수정, 관리자 전체 읽기/수정
drop policy if exists sessions_insert_self on public.sessions;
create policy sessions_insert_self on public.sessions
  for insert with check (auth.uid() = user_id);
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update using (auth.uid() = user_id or public.is_admin());

-- ===== 6) 게임 상태 저장(재접속 시 구슬·회전·모드 등 그대로 복원) =====
create table if not exists public.game_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.game_states enable row level security;
drop policy if exists gs_rw_self on public.game_states;
create policy gs_rw_self on public.game_states
  for all using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id);

-- 실시간(관리자 콘솔 자동 갱신)용 — 이미 추가돼 있어도 에러 없이.
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.sessions;
exception when others then null; end $$;
