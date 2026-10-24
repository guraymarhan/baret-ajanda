// Baret Ajanda – "reminders" fonksiyonu
// pg_cron tarafından 5 dakikada bir çağrılır (supabase/cron.sql). Zamanı gelen hatırlatmaları gönderir (ekip girdileri herkese, kişisel olanlar sadece sahibine).
// Gerekli secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET
// Bu fonksiyonda "Verify JWT" KAPALI olmalı (cron kendi gizli anahtarıyla çağırır).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const TZ = "Europe/Istanbul";
const EMOJI: Record<string, string> = { rental: "📦", shoot: "🎬", meeting: "🤝", reminder: "⏰" };

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
