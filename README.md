# 🪖 Baret Ajanda

Prodüksiyon ekibi için ortak ajanda: **çekim takvimi, toplantılar ve hatırlatıcılar**. Telefona uygulama gibi kurulur (PWA), ekip arasında anlık senkron olur, biri yeni girdi ekleyince diğerlerine bildirim düşer ve iPhone Takvimi'ne abone olunabilir.

**Uygulama:** https://guraymarhan.github.io/baret-ajanda/
**Kurulum:** [KURULUM.md](KURULUM.md)

## Özellikler

- 🎬 Çekim (çok günlü olabilir), 🤝 toplantı, ⏰ hatırlatıcı (tamamlandı işaretli)
- Haftalık şerit + ajanda listesi, aylık takvim görünümü, türe göre filtre
- Gerçek zamanlı senkron: ekip arkadaşının eklediği girdi anında ekranına düşer
- Push bildirimi: yeni girdi, değişiklik, silme ve zamanı gelen hatırlatmalar
- iPhone / Google Takvim aboneliği (webcal, kişisel link)
- Karanlık mod, çevrimdışı açılış, ana ekran kısayolu
- Supabase bağlanmadan önce cihazda çalışan deneme modu

## Yapı

| Dosya | Görev |
|---|---|
| `index.html`, `styles.css`, `app.js` | Arayüz (derleme adımı yok, saf JS) |
| `config.js` | Supabase adresi ve herkese açık anahtarlar |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA: kurulum, çevrimdışı, bildirim |
| `supabase/schema.sql` | Tablolar, güvenlik kuralları, realtime |
| `supabase/cron.sql` | Hatırlatıcı zamanlayıcısı (pg_cron) |
| `supabase/functions/notify` | Ekibe push bildirimi gönderir |
| `supabase/functions/reminders` | Zamanı gelen hatırlatmaları gönderir |
| `supabase/functions/ical` | Takvim abonelik akışı |
| `tools/vapid.html` | Tarayıcıda VAPID anahtarı üretir |
