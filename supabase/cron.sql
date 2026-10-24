-- Baret Ajanda – zamanlanmış bildirimler
--   • her 5 dakikada bir: zamanı gelen hatırlatmalar
--   • her sabah 09:00 (İstanbul): "Günaydın 🪖" + günün özeti
-- Önce "reminders" fonksiyonunu kurun ve CRON_SECRET'ı belirleyin (KURULUM.md, Adım 5).
-- Sonra aşağıdaki iki değeri (her ikisi de iki yerde geçiyor) kendi bilgilerinizle değiştirip SQL Editor'de çalıştırın:
--   PROJE_REF   → Project Settings → General → Project ID (örn. abcdxyzqwerty)
--   CRON_SECRET → Edge Functions secrets'a yazdığınız değerin aynısı

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('baret-reminders')
where exists (select 1 from cron.job where jobname = 'baret-reminders');

select cron.schedule(
  'baret-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://PROJE_REF.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET'),
    body    := '{}'::jsonb
  );
  $$
);

-- Sabah 09:00 İstanbul = 06:00 UTC
select cron.unschedule('baret-morning')
where exists (select 1 from cron.job where jobname = 'baret-morning');

select cron.schedule(
  'baret-morning',
  '0 6 * * *',
  $$
  select net.http_post(
    url     := 'https://PROJE_REF.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'CRON_SECRET'),
    body    := '{"mode":"morning"}'::jsonb
  );
  $$
);
