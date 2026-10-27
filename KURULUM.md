# Baret Ajanda – Kurulum Rehberi

Toplam süre: yaklaşık 20 dakika. Terminal gerekmiyor, her şey tarayıcıdan yapılıyor.

Uygulama adresi: **https://guraymarhan.github.io/baret-ajanda/**

Supabase bağlanana kadar uygulama **Deneme modunda** çalışır: tasarımı deneyebilirsin ama veriler sadece o cihazda kalır. Aşağıdaki adımlar ekip senkronunu, bildirimleri ve iPhone Takvim aboneliğini açar.

---

## Adım 1 – Supabase projesi aç (ücretsiz)

1. [supabase.com](https://supabase.com) → **Start your project** → GitHub hesabınla giriş yap.
2. **New project**:
   - Name: `baret-ajanda`
   - Database password: güçlü bir şifre (bir yere not et)
   - Region: **Central EU (Frankfurt)** (Türkiye'ye en yakın)
3. Proje hazırlanınca (1–2 dk) devam et.

## Adım 2 – Veritabanını kur

1. Sol menü → **SQL Editor** → **New query**.
2. Depodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını kopyala, yapıştır, **Run**.
3. "Success. No rows returned" görürsen tamam.

## Adım 3 – Giriş ayarları

1. Sol menü → **Authentication** → **Sign In / Providers** → **Email**:
   - **Confirm email** seçeneğini kapat (ekip arkadaşın e-posta onayıyla uğraşmadan girsin). İstersen açık bırakabilirsin; o zaman kayıttan sonra gelen maildeki linke dokunmak gerekir.
2. **Authentication** → **URL Configuration** → **Site URL**: `https://guraymarhan.github.io/baret-ajanda/`

## Adım 4 – Bildirim anahtarı üret

1. Şu sayfayı aç: **https://guraymarhan.github.io/baret-ajanda/tools/vapid.html**
2. **Anahtar üret**'e bas. İki değer çıkacak:
   - `VAPID_PUBLIC_KEY` (herkese açık)
   - `VAPID_PRIVATE_KEY` (**gizli**, kimseyle paylaşma)

## Adım 5 – Gizli değerleri Supabase'e yaz

Sol menü → **Edge Functions** → **Secrets** (ya da Project Settings → Edge Functions) → şu dört değeri ekle:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | Adım 4'teki public key |
| `VAPID_PRIVATE_KEY` | Adım 4'teki private key |
| `VAPID_SUBJECT` | `mailto:senin@epostan.com` |
| `CRON_SECRET` | Uydurduğun uzun rastgele bir metin (örn. `baret-7f3k29xq-hatirlat`) |

## Adım 6 – Üç küçük sunucu fonksiyonunu kur

Sol menü → **Edge Functions** → **Deploy a new function** → **Via Editor**. Her biri için: adı yaz, editördeki örnek kodu sil, depodaki dosyanın içeriğini yapıştır, **Deploy**.

| Fonksiyon adı | Kod dosyası | "Verify JWT" ayarı |
|---|---|---|
| `notify` | [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts) | **Kapalı** |
| `ical` | [`supabase/functions/ical/index.ts`](supabase/functions/ical/index.ts) | **Kapalı** |
| `reminders` | [`supabase/functions/reminders/index.ts`](supabase/functions/reminders/index.ts) | **Kapalı** |

"Verify JWT" ayarı: fonksiyona tıkla → **Details** (ya da Settings) sekmesi → JWT doğrulama anahtarını kapat → **Save**. Üçü de kapalı olmalı: `notify` girişi kendi kodunda kontrol ediyor (yeni Supabase projelerinde açık kalırsa bildirim takılabiliyor), `ical` takvim uygulamalarının, `reminders` zamanlayıcının çağırabilmesi için kapalı; ikisi de kendi gizli anahtarıyla korunuyor.

> Terminal kullanmayı biliyorsan alternatif: `npx supabase login`, `npx supabase link`, sonra `npx supabase functions deploy notify --no-verify-jwt`, `npx supabase functions deploy ical --no-verify-jwt`, `npx supabase functions deploy reminders --no-verify-jwt`.

## Adım 7 – Hatırlatıcı zamanlayıcısını aç

1. **SQL Editor** → **New query**.
2. [`supabase/cron.sql`](supabase/cron.sql) içeriğini yapıştır.
3. İçindeki `PROJE_REF` yazısını (iki yerde) kendi proje kimliğinle (Project Settings → General → **Project ID**), `CRON_SECRET` yazısını da (iki yerde) Adım 5'te uydurduğun metinle değiştir → **Run**.

Artık her 5 dakikada bir zamanı gelen hatırlatmalar, her sabah 09:00'da da "Günaydın 🪖" bildirimi (motivasyon cümlesi + günün özeti) telefonlara düşer.

## Adım 8 – Uygulamayı Supabase'e bağla

Project Settings → **API** (ya da **API Keys**) sayfasından iki değeri al:
- **Project URL** (örn. `https://abcdxyzqwerty.supabase.co`)
- **anon / public** (ya da **publishable**) key

Sonra GitHub'da [`config.js`](config.js) dosyasını aç → kalem ✏️ simgesine bas → üç değeri tırnakların içine yapıştır → **Commit changes**:

```js
export const SUPABASE_URL = "https://abcdxyzqwerty.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
export const VAPID_PUBLIC_KEY = "BExample...";
```

(İstersen bu üç değeri Claude'a yaz, o da senin yerine doldursun. Üçü de herkese açık olacak şekilde tasarlanmış değerler. **Private key'i ve database şifresini asla yazma.**)

Bir iki dakika içinde site güncellenir.

## Adım 9 – Telefonlara kur

Her ekip üyesi için:

**iPhone (iOS 16.4 veya üstü)**
1. **Safari** ile uygulama adresini aç (Chrome'da değil).
2. Alttaki **Paylaş** ⬆︎ → **Ana Ekrana Ekle** → Ekle.
3. Ana ekrandaki **Baret** simgesinden aç → **Kaydol** (adın, e-posta, şifre).
4. Çıkan "Yeni girdilerden haberdar ol" kartında **Aç**'a bas → bildirim iznine **İzin Ver**.
5. Sağ üstteki avatar → **Ayarlar** → **Takvime ekle** → **Abone Ol**. Artık ajanda iPhone Takvimi'nde de görünür.
   - Daha sık güncellensin istersen: iPhone Ayarlar → Takvim → Hesaplar → Abone Olunan Takvimler → Baret Ajanda → Getir: **Her 15 dakikada**.

**Android**
1. **Chrome** ile adresi aç → menü ⋮ → **Uygulamayı yükle** (ya da sayfadaki **Yükle** kartı).
2. Kaydol → bildirimleri aç. Google Takvim'de görmek için Ayarlar'daki **Linki kopyala** → Google Takvim (bilgisayardan) → Diğer takvimler → **URL ile ekle**.

## Adım 10 – Kapıyı kilitle

Ekipteki herkes kaydolduktan sonra: **Authentication** → **Sign In / Providers** → **Allow new users to sign up** seçeneğini **kapat**. Böylece dışarıdan kimse hesap açamaz. Yeni biri katılacaksa geçici olarak tekrar aç.

---

## Sık sorulanlar

**Bildirim gelmiyor.**
- iPhone'da uygulamayı mutlaka **ana ekrandaki simgeden** açıp bildirimi oradan açmalısın; Safari sekmesinde push çalışmaz.
- Kendi eklediğin girdi için sana bildirim gelmez, sadece diğer ekip üyelerine gider.
- Supabase → Edge Functions → `notify` → **Logs** sekmesinde hata var mı bak.

**iPhone Takvimi'nde düzenleme yapabilir miyim?**
Hayır, abonelik tek yönlü: düzenlemeyi uygulamada yap, takvim kendiliğinden güncellenir. İki yönlü senkron için App Store'a çıkan bir native uygulama gerekir.

**Verilerimiz güvende mi?**
Kod herkese açık ama veriler Supabase'te. Sadece giriş yapmış ekip üyeleri okuyup yazabilir (Row Level Security). Takvim linki kişiye özel ve tahmin edilemez bir anahtar içerir; linki paylaşmamaya dikkat et.

**Ücret?**
Supabase ücretsiz katmanı ve GitHub Pages bu kullanım için fazlasıyla yeterli. Not: Supabase ücretsiz projeler 1 hafta hiç kullanılmazsa duraklatılır; panelden tek tıkla geri açılır.
