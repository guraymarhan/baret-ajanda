// Baret Ajanda – "notify" fonksiyonu
// Bir ekip üyesi girdi ekleyince/değiştirince/silince diğer üyelerin telefonlarına push bildirimi gönderir.
// Gerekli secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (örn. mailto:siz@ornek.com)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const TZ = "Europe/Istanbul";
const KIND = {
  rental: { emoji: "📦", label: "kiralama" },
  shoot: { emoji: "🎬", label: "çekim" },
  meeting: { emoji: "🤝", label: "toplantı" },
  reminder: { emoji: "⏰", label: "hatırlatıcı" },
} as const;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function whenText(ev: { starts_at: string; all_day: boolean }) {
  const d = new Date(ev.starts_at);
  const day = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
  if (ev.all_day) return day;
  const time = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day} ${time}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { event_id, action = "created", snapshot } = await req.json().catch(() => ({}));

  let ev = snapshot;
  if (action !== "deleted") {
    const { data } = await admin.from("events").select("*").eq("id", event_id).single();
    ev = data;
  }
  if (!ev) return json({ error: "event not found" }, 404);

  const { data: actor } = await admin.from("profiles").select("name").eq("id", user.id).single();
  const who = actor?.name ?? "Bir ekip üyesi";
  const k = KIND[ev.kind as keyof typeof KIND] ?? KIND.reminder;
  const verb = action === "created" ? `yeni ${k.label} ekledi` : action === "deleted" ? `${k.label} sildi` : `${k.label} güncelledi`;

  const payload = JSON.stringify({
    title: `${k.emoji} ${who} ${verb}`,
    body: [ev.title, whenText(ev), ev.location].filter(Boolean).join(" · "),
    tag: `event-${ev.id}`,
    url: action === "deleted" ? "./" : `./?event=${ev.id}`,
  });

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const { data: subs } = await admin.from("push_subscriptions").select("*").neq("user_id", user.id);
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
      sent++;
    } catch (err) {
      // Telefon aboneliği iptal ettiyse kaydı temizle
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.error("push failed", code, err);
    }
  }));

  return json({ sent });
});
