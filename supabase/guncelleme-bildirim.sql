-- Baret Ajanda – bildirim güncellemesi (Kasım 2026)
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

-- 4) Kontrol: kimin kaç telefonu kayıtlı ve zamanlayıcı son 3 günde nasıl çalıştı
select 'telefon' as tur, p.name as kim, count(s.endpoint)::text as sonuc, max(coalesce(s.last_seen_at, s.created_at))::text as zaman
from public.profiles p left join public.push_subscriptions s on s.user_id = p.id
group by p.name
union all
select 'zamanlayıcı', j.jobname, d.status || ' ' || coalesce(left(d.return_message, 60), ''), d.start_time::text
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname = 'baret-morning' and d.start_time > now() - interval '4 days'
order by 1, 4 desc;
