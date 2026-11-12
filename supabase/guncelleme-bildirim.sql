-- Baret Ajanda – bildirim güncellemesi
-- Mevcut kuruluma bir kez SQL Editor'de çalıştırın. Tekrar çalıştırmak zararsızdır.

-- 1) Telefonların son görülme zamanı (uygulama her açılışta aboneliği tazeler)
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz;

-- 2) Bildirim gönderim kaydı: Table Editor → push_log
create table if not exists public.push_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  kind    text not null,
  sent    int not null default 0,
  failed  int not null default 0,
  detail  text
);
alter table public.push_log enable row level security;

-- 3) Zamanlayıcının sunucuyu bekleme süresi 5 sn → 30 sn (soğuk açılışta istek yarıda kesilmesin)
select cron.alter_job(jobid, command := replace(command, '::jsonb
  );', '::jsonb,
    timeout_milliseconds := 30000
  );'))
from cron.job
where jobname in ('baret-reminders', 'baret-morning') and command not like '%timeout_milliseconds%';

-- 4) Sabah özeti telefon başına günde bir kez gitsin, gitmediyse 5 dakikada bir yeniden denensin
alter table public.push_subscriptions add column if not exists morning_day date;

-- 5) Sunucunun "hatırlatıldı" işareti girdiyi düzenlenmiş gibi göstermesin
create or replace function public.touch_event()
returns trigger language plpgsql as $$
begin
  -- Sunucu sadece "hatırlatıldı" işaretini değiştirdiyse düzenleme sayılmaz
  if to_jsonb(new) - 'reminded' = to_jsonb(old) - 'reminded' then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  -- Saat ya da hatırlatma değiştiyse hatırlatıcı yeniden gönderilsin
  if new.starts_at is distinct from old.starts_at
     or new.remind_minutes is distinct from old.remind_minutes
     or new.all_day is distinct from old.all_day then
    new.reminded := false;
  end if;
  return new;
end $$;

-- 6) Kontrol: kayıtlı telefonlar ve son gönderimler
select 'telefon' as tur, p.name as kim, count(s.endpoint)::text as sonuc,
       max(coalesce(s.last_seen_at, s.created_at))::text as zaman, max(s.morning_day)::text as detay
from public.profiles p left join public.push_subscriptions s on s.user_id = p.id
group by p.name
union all
select * from (
  select 'gönderim', l.kind, l.sent || ' gitti, ' || l.failed || ' hata', l.at::text, left(l.detail, 80)
  from public.push_log l order by l.at desc limit 25
) x
order by 1 desc, 4 desc;
