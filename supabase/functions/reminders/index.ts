// Baret Ajanda – "reminders" fonksiyonu
// pg_cron tarafından 5 dakikada bir çağrılır (supabase/cron.sql). Her çağrıda:
//  - zamanı gelen hatırlatmaları gönderir (ekip girdileri herkese, kişisel olanlar sadece sahibine)
//  - saat 09:00–13:00 arasındaysa, o gün "Günaydın 🪖" almamış her telefona sabah özetini gönderir.
//    Telefon başına günde bir kez gider (push_subscriptions.morning_day); bir deneme başarısız olursa
//    5 dakika sonra kendiliğinden yeniden denenir. Tek bir 09:00 çağrısına bağlı değildir.
//  - {"mode":"broadcast"}: elle duyuru (supabase/duyuru.sql)
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
type Admin = any;

const PUSH_OPTS = { urgency: "high" as const };

// Tek bir telefona gönderir. "ok" | "gone" (abonelik iptal, kayıt silindi) | hata metni
async function sendTo(admin: Admin, s: Row, payload: string, ttl: number): Promise<string> {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: ttl, ...PUSH_OPTS });
    return "ok";
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      return "gone";
    }
    console.error("push failed", code, err);
    return `${String(s.user_id).slice(0, 8)}:${code ?? (err as Error).message}`;
  }
}

const log = (admin: Admin, kind: string, results: string[], title: string) =>
  admin.from("push_log").insert({
    kind,
    sent: results.filter((r) => r === "ok").length,
    failed: results.filter((r) => r !== "ok").length,
    detail: [title, ...results.filter((r) => r !== "ok")].join(", "),
  });

/* ───────────────────────── Sabah özeti ───────────────────────── */
// Bu telefona bugün sabah mesajı gitti mi? Gitmediyse "bugün gitti" diye işaretleyip true döner.
// İşaretleme tek sorguda yapılır; aynı anda iki çağrı gelse bile mesaj bir kez gider.
// null: morning_day kolonu yok (guncelleme-bildirim.sql henüz çalıştırılmamış).
async function claimMorning(admin: Admin, endpoint: string, day: string): Promise<boolean | null> {
  const { data, error } = await admin.from("push_subscriptions")
    .update({ morning_day: day }).eq("endpoint", endpoint)
    .or(`morning_day.is.null,morning_day.lt.${day}`).select("endpoint");
  if (error) return null;
  return (data ?? []).length > 0;
}

async function morningDigest(admin: Admin, subs: Row[], forced: boolean) {
  const { from, to, dayOfYear } = istanbulDay();
  const day = new Date(from.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
  const pending = subs.filter((s) => s.morning_day !== day);
  if (!pending.length) return null;

  const motivation = MOTIVATION[dayOfYear % MOTIVATION.length];
  const [{ data: events }, { data: dueTasks }] = await Promise.all([
    admin.from("events").select("*").lt("starts_at", to.toISOString()).gte("starts_at", new Date(from.getTime() - 31 * 86400_000).toISOString()),
    // Bugün teslim edilecek ya da gecikmiş açık teslimatlar
    admin.from("tasks").select("id,due_date").eq("done", false).lte("due_date", day),
  ]);
  const lateN = ((dueTasks ?? []) as Row[]).filter((t) => t.due_date < day).length;
  const todayN = (dueTasks ?? []).length - lateN;
  // Bugüne denk gelen girdiler (çok günlü kiralama/çekimler dahil)
  const todays = ((events ?? []) as Row[]).filter((e) => {
    const s = new Date(e.starts_at), end = e.ends_at ? new Date(e.ends_at) : s;
    return s < to && end >= from && !(e.kind === "reminder" && e.done);
  });

  const results = await Promise.all(pending.map(async (s) => {
    const claimed = await claimMorning(admin, s.endpoint, day);
    if (claimed === false) return "skip"; // başka bir çağrı az önce gönderdi
    if (claimed === null && !forced) return "skip"; // eski şema: sadece 09:00 çağrısında gönder
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
    const taskLine = [todayN && `📋 ${todayN} teslimat bugün`, lateN && `${lateN} gecikmiş teslimat`].filter(Boolean).join(" · ");
    if (taskLine) lines.push(taskLine);
    // Etiket her gün farklı olmalı: iPhone aynı etiketli yeni bildirimi, bildirim merkezinde duran
    // eskisinin yerine sessizce koyuyor ve ekranda göstermiyor.
    const payload = JSON.stringify({ title: "Günaydın 🪖", body: lines.join("\n"), tag: `morning-${day}`, url: "./" });
    const r = await sendTo(admin, s, payload, 4 * 3600);
    // Geçici hata: işareti geri al, 5 dakika sonraki çağrı yeniden denesin
    if (r !== "ok" && r !== "gone" && claimed) await admin.from("push_subscriptions").update({ morning_day: null }).eq("endpoint", s.endpoint);
    return r;
  }));
  const done = results.filter((r) => r !== "skip");
  if (done.length) await log(admin, "morning", done, day);
  return { sent: done.filter((r) => r === "ok").length, tried: done.length };
}

/* ───────────────────────── Hatırlatmalar ───────────────────────── */
// Tüm gün girdilerinin saati yoktur; hatırlatması gece yarısı yerine sabah 09:00'a göre hesaplanır
const baseTime = (ev: Row) => new Date(ev.starts_at).getTime() + (ev.all_day ? 9 * 3600_000 : 0);

// Bildirim başlığındaki süre, seçilen hatırlatma süresine değil gerçekte kalan zamana göre yazılır
function leadText(ev: Row, now: number) {
  if (ev.all_day) {
    const days = Math.round((istanbulDay(new Date(ev.starts_at)).from.getTime() - istanbulDay(new Date(now)).from.getTime()) / 86400_000);
    return days <= 0 ? "Bugün" : days === 1 ? "Yarın" : `${days} gün sonra`;
  }
  const min = Math.round((baseTime(ev) - now) / 60_000);
  if (min <= 2) return "Şimdi";
  if (min < 60) return `${min} dk sonra`;
  if (min < 1440) return `${Math.round(min / 60)} saat sonra`;
  return `${Math.round(min / 1440)} gün sonra`;
}

async function dueReminders(admin: Admin, subs: Row[]) {
  const now = Date.now();
  // Önümüzdeki 8 gün içinde başlayacak ve henüz hatırlatılmamış girdiler
  const { data: events, error } = await admin
    .from("events")
    .select("*")
    .eq("reminded", false)
    .eq("done", false)
    .not("remind_minutes", "is", null)
    .gte("starts_at", new Date(now - 12 * 3600_000).toISOString())
    .lte("starts_at", new Date(now + 8 * 24 * 3600_000).toISOString());
  if (error) throw new Error(error.message);

  const due = ((events ?? []) as Row[]).filter((e) => baseTime(e) - e.remind_minutes * 60_000 <= now);
  for (const ev of due) {
    // Önce "hatırlatıldı" diye işaretle; aynı anda gelen ikinci çağrı aynı bildirimi tekrar göndermesin
    const { data: claimed } = await admin.from("events").update({ reminded: true }).eq("id", ev.id).eq("reminded", false).select("id");
    if (!(claimed ?? []).length) continue;
    // Bir saatten fazla geçmişse artık hatırlatmanın anlamı yok; işaretli kalsın
    if (baseTime(ev) < now - 3600_000) continue;
    const d = new Date(ev.starts_at);
    const time = ev.all_day
      ? new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d)
      : new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", hour: "2-digit", minute: "2-digit" }).format(d);
    const payload = JSON.stringify({
      title: `${EMOJI[ev.kind] ?? "⏰"} ${leadText(ev, now)}: ${ev.title}`,
      body: [time, ev.location].filter(Boolean).join(" · "),
      tag: `reminder-${ev.id}-${now}`,
      url: `./?event=${ev.id}`,
    });
    // Kişisel hatırlatıcı sadece sahibine, ekip girdileri herkese gider
    const targets = subs.filter((s) => ev.visibility !== "private" || s.user_id === ev.created_by);
    const results = await Promise.all(targets.map((s) => sendTo(admin, s, payload, 3600)));
    await log(admin, "reminder", results, ev.title);
    // Hiçbir telefona ulaşmadıysa (geçici hata) işareti geri al, sonraki çağrı yeniden denesin
    if (results.length && results.every((r) => r !== "ok" && r !== "gone")) {
      await admin.from("events").update({ reminded: false }).eq("id", ev.id);
    }
  }
  return due.length;
}

async function run(admin: Admin, mode?: string) {
  const { data: subs } = await admin.from("push_subscriptions").select("*");
  const list = (subs ?? []) as Row[];
  const due = await dueReminders(admin, list);
  // Sabah özeti: İstanbul saatiyle 09:00–13:00 arası (ya da 09:00 çağrısının kendisi)
  const hour = new Date(Date.now() + 3 * 3600_000).getUTCHours();
  const forced = mode === "morning";
  const morning = forced || (hour >= 9 && hour < 13) ? await morningDigest(admin, list, forced) : null;
  return { due, morning };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );
  const input = await req.json().catch(() => ({}));

  // Elle duyuru: {"mode":"broadcast","title":"...","body":"..."} → tüm telefonlara
  if (input.mode === "broadcast") {
    const { data: subs } = await admin.from("push_subscriptions").select("*");
    const payload = JSON.stringify({ title: input.title || "Baret Ajanda", body: input.body || "", tag: `broadcast-${Date.now()}`, url: "./" });
    const results = await Promise.all(((subs ?? []) as Row[]).map((s) => sendTo(admin, s, payload, 3600)));
    await log(admin, "broadcast", results, input.title || "");
    return Response.json({ broadcast: true, sent: results.filter((r) => r === "ok").length });
  }

  const work = run(admin, input.mode).catch(async (err) => {
    console.error("reminders failed", err);
    await admin.from("push_log").insert({ kind: "error", detail: String((err as Error).message ?? err).slice(0, 300) });
    return { error: true };
  });
  // Zamanlayıcı yanıtı beklemeden bağlantıyı kapatsa bile gönderim yarıda kalmasın
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  return Response.json(await work);
});
