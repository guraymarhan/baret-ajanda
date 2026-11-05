-- Baret Ajanda – tüm telefonlara elle bildirim
-- Başlığı ve metni değiştirip SQL Editor'de çalıştırın. Gizli anahtar zamanlayıcı kaydından otomatik alınır.
select net.http_post(
  url     := substring(command from 'url\s*:=\s*''([^'']+)'''),
  headers := jsonb_build_object('Content-Type', 'application/json',
                                'x-cron-secret', substring(command from 'x-cron-secret'',\s*''([^'']+)''')),
  body    := jsonb_build_object('mode', 'broadcast',
                                'title', 'İyi geceler 🌙',
                                'body', 'Uygulama güncellendi 🙂 Bildirimler artık daha hızlı ve güvenilir. Yarın 09:00''da görüşürüz.'),
  timeout_milliseconds := 30000
)
from cron.job where jobname = 'baret-morning';
