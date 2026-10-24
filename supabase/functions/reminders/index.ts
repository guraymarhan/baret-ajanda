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

// Sabah 09:00 bildirimi için motivasyon cümleleri (her gün sırayla biri)
const MOTIVATION = [
  "Bugün çekilecek her kare, yarının portfolyosu.",
  "Işık senden yana, kadraj senin elinde.",
  "Planı iyi olan setin sürprizi az olur.",
  "Küçük ekip, büyük iş. Hadi bakalım!",
  "Kahveni al, call sheet'i kontrol et, gerisi akar.",
  "En iyi plan B, iyi hazırlanmış plan A'dır.",
  "Bugün de hikâye anlatmak için güzel bir gün.",
  "Sabır, ışık ve biraz şans: iyi bir gün için yeter.",
  "Her büyük prodüksiyon tek bir listeyle başlar.",
  "Detaylar filmi yapar. Bugün detay günü.",
  "Ekip uyumlu, ekipman hazır, gün senin.",
  "Ses var, kamera var, motor!",
  "Mükemmel çekim yok, iyi hazırlık var.",
  "Bugün bir sahneyi daha gerçeğe dönüştür.",
  "Zor sahneler en güzel kamera arkası hikâyeleridir.",
  "Saatine sadık kalan set, güne erken veda eder.",
  "İyi bir gün, iyi bir kadrajla başlar.",
  "Bugün yapacağın iş, birinin aklında kalacak bir görüntü olacak.",
  "Önce güvenlik, sonra güzellik. Baretini tak!",
  "Yorgunluk geçer, iyi çekilmiş kare kalır.",
  "Her toplantı bir sonraki çekimin provasıdır.",
  "Doğru ekip, doğru ışık, doğru an: bugün hepsi bir arada olsun.",
  "Hazırlık yarı yarıya çekimdir.",
  "Bir kare bin kelime eder, bugün bin kelimelik işler çıkar.",
  "Gün uzun, enerji yüksek. Başlayalım!",
  "Kamerayı açmadan önce gülümse, setin havası senden başlar.",
  "Bugün iyi kararlar, temiz kayıtlar günü.",
  "Plan yaptıysan yarısını hallettin bile.",
  "İyi işler acele sevmez ama ertelemeyi hiç sevmez.",
  "Hikâyeyi sen anlatıyorsun, gün sana uysun.",
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
