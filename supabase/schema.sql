-- Baret Ajanda – veritabanı şeması
-- Supabase panelinde: SQL Editor → New query → bu dosyanın tamamını yapıştır → Run

-- ───────────────────────── Profiller ─────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text not null default 'Ekip üyesi',
  color       text not null default '#FFB800',
  ical_token  uuid not null default gen_random_uuid() unique,
  created_at  timestamptz not null default now()
);

-- Yeni kullanıcı kaydolunca profilini otomatik oluştur
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, color)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'color', '#FFB800')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Etkinlikler ─────────────────────────
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('rental', 'shoot', 'meeting', 'reminder')),
  title           text not null check (length(title) between 1 and 200),
  starts_at       timestamptz not null,
  ends_at         timestamptz,
  all_day         boolean not null default false,
  location        text,
  notes           text,
  remind_minutes  integer check (remind_minutes is null or remind_minutes >= 0),
  visibility      text not null default 'team' check (visibility in ('team', 'private')),
  reminded        boolean not null default false,
  done            boolean not null default false,
  created_by      uuid references auth.users on delete set null default auth.uid(),
  updated_by      uuid references auth.users on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists events_starts_at_idx on public.events (starts_at);

-- Kiralamalar birbiriyle aynı saatlere denk gelemez (iki kişi aynı anda eklese bile)
do $$
begin
  alter table public.events add constraint rentals_no_overlap
    exclude using gist (tstzrange(starts_at, coalesce(ends_at, starts_at), '[)') with &&)
    where (kind = 'rental');
exception when duplicate_object then null;
end $$;

create or replace function public.touch_event()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  -- Saat ya da hatırlatma değiştiyse hatırlatıcı yeniden gönderilsin
  if new.starts_at is distinct from old.starts_at
     or new.remind_minutes is distinct from old.remind_minutes then
    new.reminded := false;
  end if;
  return new;
end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch
  before update on public.events
  for each row execute function public.touch_event();

-- ───────────────────────── Teslimatlar (genel yapılacaklar) ─────────────────────────
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 200),
  due_date    date,
  notes       text,
  done        boolean not null default false,
  done_at     timestamptz,
  done_by     uuid references auth.users on delete set null,
  created_by  uuid references auth.users on delete set null default auth.uid(),
  updated_by  uuid references auth.users on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.touch_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch
  before update on public.tasks
  for each row execute function public.touch_task();

-- ───────────────────────── Push abonelikleri ─────────────────────────
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Güvenlik (RLS) ─────────────────────────
-- Giriş yapmış herkes ekibin parçasıdır: ekip girdilerini görür ve düzenler.
-- "Kişisel" (visibility = 'private') girdileri yalnızca ekleyen kişi görür.
-- Ekip tamamlanınca Authentication → Sign In / Providers → "Allow new users to sign up" kapatın.
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select to authenticated using (true);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "events team access" on public.events;
drop policy if exists "events read" on public.events;
drop policy if exists "events insert" on public.events;
drop policy if exists "events update" on public.events;
drop policy if exists "events delete" on public.events;
create policy "events read" on public.events
  for select to authenticated using (visibility = 'team' or created_by = auth.uid());
create policy "events insert" on public.events
  for insert to authenticated with check (created_by = auth.uid());
create policy "events update" on public.events
  for update to authenticated
  using (visibility = 'team' or created_by = auth.uid())
  with check (visibility = 'team' or created_by = auth.uid());
create policy "events delete" on public.events
  for delete to authenticated using (visibility = 'team' or created_by = auth.uid());

drop policy if exists "tasks team access" on public.tasks;
create policy "tasks team access" on public.tasks
  for all to authenticated using (true) with check (true);

drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Anlık senkron ─────────────────────────
alter table public.events replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
alter table public.tasks replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null;
end $$;
