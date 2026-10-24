// Baret Ajanda – "notify" fonksiyonu
// Bir ekip üyesi girdi ekleyince/değiştirince/silince ya da teslimat ekleyip tamamlayınca
// diğer üyelerin telefonlarına push bildirimi gönderir.
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

// Gönderen hariç tüm ekip üyelerinin telefonlarına push gönderir
// deno-lint-ignore no-explicit-any
async function pushToOthers(admin: any, senderId: string, message: Record<string, unknown>) {
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const payload = JSON.stringify(message);
  const { data: subs } = await admin.from("push_subscriptions").select("*").neq("user_id", senderId);
  let sent = 0;
  // deno-lint-ignore no-explicit-any
  await Promise.all((subs ?? []).map(async (s: any) => {
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
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { event_id, action = "created", snapshot, table, task_id } = await req.json().catch(() => ({}));

  // Teslimat listesi: yeni eklendi / tamamlandı
  if (table === "tasks") {
    const { data: task } = await admin.from("tasks").select("*").eq("id", task_id).single();
    if (!task) return json({ error: "task not found" }, 404);
    const { data: actor } = await admin.from("profiles").select("name").eq("id", user.id).single();
    const who = actor?.name ?? "Bir ekip üyesi";
    const due = task.due_date
      ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", weekday: "short" }).format(new Date(task.due_date + "T12:00:00Z"))
      : null;
    return json({ sent: await pushToOthers(admin, user.id, {
      title: action === "done" ? `✅ ${who} tamamladı` : `📋 ${who} yeni teslimat ekledi`,
      body: [task.title, action === "done" ? null : due && `Teslim: ${due}`].filter(Boolean).join(" · "),
      tag: `task-${task.id}`,
      url: "./?view=tasks",
    }) });
  }

  let ev = snapshot;
  if (action !== "deleted") {
    const { data } = await admin.from("events").select("*").eq("id", event_id).single();
    ev = data;
  }
  if (!ev) return json({ error: "event not found" }, 404);
  if (ev.visibility === "private") return json({ sent: 0, private: true }); // kişisel girdiler paylaşılmaz

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

  return json({ sent: await pushToOthers(admin, user.id, JSON.parse(payload)) });
});
