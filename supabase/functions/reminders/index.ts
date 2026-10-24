// Baret Ajanda – "reminders" fonksiyonu
// pg_cron tarafından çağrılır (supabase/cron.sql):
//  - 5 dakikada bir: zamanı gelen hatırlatmalar (ekip girdileri herkese, kişisel olanlar sadece sahibine)
//  - her sabah 09:00 ({"mode":"morning"}): "Günaydın 🪖" + motivasyon + günün özeti
// Gerekli secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// Bu fonksiyonda "Verify JWT" KAPALI olmalı (cron kendi gizli anahtarıyla çağırır).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const TZ = "Europe/Istanbul";
const EMOJI: Record<string, string> = { rental: "📦", shoot: "🎬", meeting: "🤝", reminder: "⏰" };

// Sabah 09:00 bildirimi için güne iyi başlatan, hayata dair cümleler (her gün sırayla biri)
const MOTIVATION = [
  "Bugün kendine biraz daha nazik ol.",
  "Güneş her sabah yeniden doğuyor, sen de doğabilirsin.",
  "Derin bir nefes al. Her şey yolunda gidecek.",
  "Küçük mutluluklar büyük günleri taşır.",
  "Bugün birine gülümse, belki en çok ona iyi gelir.",
  "Acele etme. Çiçekler de bir günde açmıyor.",
  "Dün geride kaldı, bugün sana ait.",
  "Bir fincan sıcak çay, bir dost sesi. Bazen yeter.",
  "Olduğun yerden başla, elindekiyle yetin, yapabildiğini yap.",
  "Kalbin hafif olsun, yolun açık olsun.",
  "Her sabah hayatın sana verdiği yeni bir sayfa.",
  "Bugün kendine iyi bak, sen önemlisin.",
  "Yağmurdan sonra toprak kokusu gelir. Zor günler de geçer.",
  "Sevdiklerine bugün bir mesaj at. Sesin iyi gelir.",
  "Mükemmel olmak zorunda değilsin, sadece sen ol.",
  "Pencereyi aç, gökyüzüne bak, şükret.",
  "İyilik ettiğin her an dünyaya bir tohum ekiyorsun.",
  "Yavaşla. Güzel şeyler fark edilmeyi bekliyor.",
  "Bugün seni gülümsetecek küçük bir şey mutlaka olacak.",
  "Kendine verdiğin söz, en değerli sözdür.",
  "Huzur uzakta değil, içindeki sessizlikte.",
  "Bugün sadece bugünü yaşa.",
  "Her şeyi kontrol edemezsin ama nasıl baktığını seçebilirsin.",
  "Güzel bir gün bazen sadece güzel bir niyetle başlar.",
  "Gülmek ruhun ilacıdır, bugün bol bol iç.",
  "Dinlenmek de ilerlemenin bir parçası.",
  "Sen düşündüğünden daha güçlüsün.",
  "Sabahın serinliği gibi taze bir başlangıç dilerim.",
  "Kimseyle yarışma, dünkü kendinden bir adım öte yeter.",
  "Bir kuşun şarkısı bile günü güzelleştirmeye yeter.",
  "Hayat, plan yaparken yaşadığın anların toplamı. Anı kaçırma.",
  "Bugün kendine teşekkür et, buraya kadar geldin.",
  "Kırgınlıkları bırak, yükün hafiflesin.",
  "İçten bir merhaba, kapalı kapıları açar.",
  "Her mevsimin bir güzelliği var, her günün de.",
  "Bugün az düşün, çok hisset.",
  "Güzel insanlar güzel günler getirir. Sen de birinin güzel insanısın.",
  "Zaman en iyi öğretmen, sabır en iyi dost.",
  "Bugün bir şeyi ilk kez yap, küçük de olsa.",
  "Kalbine iyi gelen yöne yürü.",
  "Ne kadar yavaş gittiğin önemli değil, durmadığın sürece.",
  "Gökyüzü ne kadar geniş, dertlerin o kadar küçük.",
  "Bir şarkı aç, eşlik et. Gün kendiliğinden düzelir.",
  "Sevgiyle yapılan her şey güzeldir.",
  "Bugün yüzüne güneş, içine huzur dolsun.",
  "Eksik olanı değil, sahip olduklarını say.",
  "Umut, en karanlık gecede bile sabahı bekler.",
  "Kendine zaman ayır. Sen de bir öncelik olmalısın.",
  "Bugün bir dost gibi davran, önce kendine.",
  "Her nefes yeni bir şans.",
  "Hayat basit güzelliklerle dolu, bakmayı bilene.",
  "İçindeki çocuğu bugün biraz oynat.",
  "Gün senin, tadını çıkar.",
  "Sakin ol. Fırtınalar da diner.",
  "Bugün iyi şeyler duyacaksın, kulağın açık olsun.",
  "Sevgi paylaştıkça çoğalan tek şey.",
  "Kahveni yavaş iç, günü acele etmeden karşıla.",
  "Bugün kalbin hafif, adımların sağlam olsun.",
  "Bir tebessüm, en güzel günaydındır.",
  "Dünya senin varlığınla biraz daha güzel.",
];
const DAY_LABEL: Record<string, string> = { rental: "kiralama", shoot: "çekim", meeting: "toplantı", reminder: "hatırlatıcı" };

// İstanbul saatine göre bugünün başlangıcı ve bitişi (UTC+3, yaz saati yok)
function istanbulDay(now = new Date()) {
  const local = new Date(now.getTime() + 3 * 3600_000);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3600_000;
  const dayOfYear = Math.floor((start - Date.UTC(local.getUTCFullYear(), 0, 1)) / 86400_000);
  return { from: new Date(start), to: new Date(start + 86400_000), dayOfYear };
}

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;
// deno-lint-ignore no-explicit-any
async function morningDigest(admin: any) {
  const { from, to, dayOfYear } = istanbulDay();
  const motivation = MOTIVATION[dayOfYear % MOTIVATION.length];
  const [{ data: events }, { data: subs }] = await Promise.all([
    admin.from("events").select("*").lt("starts_at", to.toISOString()).gte("starts_at", new Date(from.getTime() - 31 * 86400_000).toISOString()),
    admin.from("push_subscriptions").select("*"),
  ]);
  // Bugüne denk gelen girdiler (çok günlü kiralama/çekimler dahil)
  const todays = ((events ?? []) as Row[]).filter((e) => {
    const s = new Date(e.starts_at), end = e.ends_at ? new Date(e.ends_at) : s;
    return s < to && end >= from && !(e.kind === "reminder" && e.done);
  });

  let sent = 0;
  for (const s of (subs ?? []) as Row[]) {
    const mine = todays.filter((e) => e.visibility !== "private" || e.created_by === s.user_id);
    const lines = [motivation];
    if (mine.length) {
      const counts = ["rental", "shoot", "meeting", "reminder"]
        .map((k) => [k, mine.filter((e) => e.kind === k).length] as const)
        .filter(([, n]) => n)
        .map(([k, n]) => `${EMOJI[k]} ${n} ${DAY_LABEL[k]}`);
      lines.push(`Bugün: ${counts.join(" · ")}`);
      const first = mine
        .filter((e) => !e.all_day && new Date(e.starts_at) >= from)
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1))[0];
      if (first) {
        const time = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(first.starts_at));
        lines.push(`İlk: ${time} ${first.title}`);
      }
    }
    const payload = JSON.stringify({ title: "Günaydın 🪖", body: lines.join("\n"), tag: "morning", url: "./" });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3 * 3600 });
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }
  return Response.json({ morning: true, sent, today: todays.length });
}

function leadText(min: number) {
  if (min === 0) return "Şimdi";
  if (min < 60) return `${min} dk sonra`;
  if (min < 1440) return `${Math.round(min / 60)} saat sonra`;
  return `${Math.round(min / 1440)} gün sonra`;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { mode } = await req.json().catch(() => ({}));
  if (mode === "morning") {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    return morningDigest(admin);
  }
  const now = Date.now();

  // Önümüzdeki 8 gün içinde başlayacak ve henüz hatırlatılmamış girdiler
  const { data: events, error } = await admin
    .from("events")
    .select("*")
    .eq("reminded", false)
    .eq("done", false)
    .not("remind_minutes", "is", null)
    .gte("starts_at", new Date(now - 60 * 60 * 1000).toISOString())
    .lte("starts_at", new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString());
  if (error) return new Response(error.message, { status: 500 });

  const due = (events ?? []).filter((e) => new Date(e.starts_at).getTime() - e.remind_minutes * 60_000 <= now);
  if (!due.length) return Response.json({ due: 0 });

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const { data: subs } = await admin.from("push_subscriptions").select("*");

  for (const ev of due) {
    const d = new Date(ev.starts_at);
    const time = ev.all_day
      ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d)
      : new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
    const payload = JSON.stringify({
      title: `${EMOJI[ev.kind] ?? "⏰"} ${leadText(ev.remind_minutes)}: ${ev.title}`,
      body: [time, ev.location].filter(Boolean).join(" · "),
      tag: `reminder-${ev.id}`,
      url: `./?event=${ev.id}`,
    });
    // Kişisel hatırlatıcı sadece sahibine, ekip girdileri herkese gider
    const targets = (subs ?? []).filter((s) => ev.visibility !== "private" || s.user_id === ev.created_by);
    await Promise.all(targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 });
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }));
    await admin.from("events").update({ reminded: true }).eq("id", ev.id);
  }

  return Response.json({ due: due.length });
});
