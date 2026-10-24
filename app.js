// Baret Ajanda – uygulama
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from "./config.js";

const CLOUD = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const LOCALE = "tr-TR";

const KINDS = {
  rental: { label: "Kiralama", plural: "kiralama", emoji: "📦" },
  shoot: { label: "Çekim", plural: "çekim", emoji: "🎬" },
  meeting: { label: "Toplantı", plural: "toplantı", emoji: "🤝" },
  reminder: { label: "Hatırlatıcı", plural: "hatırlatıcı", emoji: "⏰" },
};
const DEFAULT_REMIND = { rental: 1440, shoot: 1440, meeting: 15, reminder: 0 };
const MULTI_DAY = { shoot: "Bitiş günü", rental: "İade günü" }; // birden fazla güne yayılabilen türler
const PLACEHOLDER = {
  rental: "Örn. Kamera + lens seti – Rent House",
  shoot: "Örn. Reklam filmi – stüdyo günü",
  meeting: "Örn. Ön prodüksiyon toplantısı",
  reminder: "Örn. Oyuncu sözleşmelerini topla",
};
const REMIND_OPTIONS = [
  [null, "Yok"], [0, "Tam zamanında"], [15, "15 dk önce"], [60, "1 saat önce"], [180, "3 saat önce"], [1440, "1 gün önce"],
];
const COLORS = ["#FF5A3C", "#FFB800", "#0EA58B", "#4F5BFF", "#A04BFF", "#FF4FA3", "#00A3E0", "#2B2B30"];

/* ───────────────────────── Yardımcılar ───────────────────────── */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7)); // Pazartesi
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (d, o) => new Intl.DateTimeFormat(LOCALE, o).format(d);
const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toLocaleUpperCase(LOCALE);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* özel mod */ } },
};

const ICON = {
  chevL: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevR: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  plus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  pin: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  lock: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  bell: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>',
};

/* ───────────────────────── Durum ───────────────────────── */
const today = () => dayKey(new Date());
const state = {
  me: null,              // { id, name, color, ical_token }
  profiles: new Map(),   // id → profil
  events: new Map(),     // id → etkinlik
  view: store.get("baret.view", "agenda"),
  filter: "all",
  selected: today(),
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  online: true,
  installEvent: null,
};
const mineIds = new Set(); // bu cihazda yeni silinenler (kendi işlemimize toast gösterme)

/* ───────────────────────── Veri katmanı ───────────────────────── */
let sb = null;
let backend;

const demoBackend = {
  KEY: "baret.demo.events.v3",
  async init() {
    state.me = store.get("baret.demo.me", { id: "demo", name: "Sen", color: "#FF5A3C" });
    state.profiles.set(state.me.id, state.me);
    state.profiles.set("demo-2", { id: "demo-2", name: "Ekip Arkadaşı", color: "#4F5BFF" });
    let list = store.get(this.KEY, null);
    if (!list) { list = seed(); store.set(this.KEY, list); }
    list.forEach((e) => state.events.set(e.id, e));
    // Aynı tarayıcıdaki diğer sekmelerle senkron (gerçek senkronun küçük bir provası)
    this.bc = "BroadcastChannel" in window ? new BroadcastChannel("baret") : null;
    if (this.bc) this.bc.onmessage = () => { state.events.clear(); store.get(this.KEY, []).forEach((e) => state.events.set(e.id, e)); render(); };
    return true;
  },
  persist() { store.set(this.KEY, [...state.events.values()]); this.bc?.postMessage("sync"); },
  async save(ev) {
    const now = new Date().toISOString();
    const row = { ...ev, id: ev.id || crypto.randomUUID(), updated_at: now, created_at: ev.created_at || now, created_by: ev.created_by || state.me.id, updated_by: state.me.id };
    state.events.set(row.id, row); this.persist(); return row;
  },
  async remove(ev) { state.events.delete(ev.id); this.persist(); },
  async updateProfile(p) { Object.assign(state.me, p); state.profiles.set(state.me.id, state.me); store.set("baret.demo.me", state.me); },
  async signOut() {},
};

const cloudBackend = {
  async init() {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return false;
    await this.loadAll(session.user);
    this.subscribe();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) this.refresh(); });
    return true;
  },
  async loadAll(user) {
    const { data: profiles } = await sb.from("profiles").select("*");
    (profiles || []).forEach((p) => state.profiles.set(p.id, p));
    state.me = state.profiles.get(user.id) || { id: user.id, name: user.email, color: "#FFB800" };
    await this.refresh();
  },
  async refresh() {
    const since = addDays(new Date(), -120).toISOString();
    const { data, error } = await sb.from("events").select("*").gte("starts_at", since).order("starts_at");
    if (error) { toast({ title: "Bağlantı sorunu", text: error.message }); return; }
    state.events.clear();
    data.forEach((e) => state.events.set(e.id, e));
    render();
  },
  subscribe() {
    sb.channel("baret-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, onRemoteChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, ({ new: p }) => { if (p?.id) { state.profiles.set(p.id, p); if (p.id === state.me.id) state.me = p; render(); } })
      .subscribe((status) => { state.online = status === "SUBSCRIBED"; renderSync(); });
  },
  async save(ev) {
    const isNew = !ev.id;
    const row = { kind: ev.kind, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, all_day: ev.all_day, location: ev.location, notes: ev.notes, remind_minutes: ev.remind_minutes, done: ev.done, visibility: ev.visibility || "team" };
    const q = isNew ? sb.from("events").insert(row) : sb.from("events").update(row).eq("id", ev.id);
    const { data, error } = await q.select().single();
    if (error) throw error;
    state.events.set(data.id, data);
    notifyTeam(data, isNew ? "created" : "updated");
    return data;
  },
  async remove(ev) {
    mineIds.add(ev.id);
    const { error } = await sb.from("events").delete().eq("id", ev.id);
    if (error) throw error;
    state.events.delete(ev.id);
    notifyTeam(ev, "deleted");
  },
  async updateProfile(p) {
    const { data, error } = await sb.from("profiles").update(p).eq("id", state.me.id).select().single();
    if (error) throw error;
    state.me = data; state.profiles.set(data.id, data);
  },
  async signOut() {
    await unsubscribePush().catch(() => {});
    await sb.auth.signOut();
    location.reload();
  },
};

function notifyTeam(ev, action) {
  if (!sb || ev.visibility === "private") return; // kişisel girdiler kimseye bildirilmez
  sb.functions.invoke("notify", { body: { event_id: ev.id, action, snapshot: action === "deleted" ? ev : undefined } })
    .catch((e) => console.warn("bildirim gönderilemedi", e));
}

const MEANINGFUL = ["kind", "title", "starts_at", "ends_at", "all_day", "location", "notes", "remind_minutes", "done"];
function onRemoteChange({ eventType, new: row, old }) {
  if (eventType === "DELETE") {
    const prev = state.events.get(old.id) || old;
    state.events.delete(old.id);
    if (!mineIds.delete(old.id) && prev.title) toast({ title: `${KINDS[prev.kind]?.emoji ?? ""} Silindi`, text: prev.title });
    render();
    return;
  }
  const prev = state.events.get(row.id);
  state.events.set(row.id, row);
  const actor = state.profiles.get(row.updated_by);
  const byOther = row.updated_by && row.updated_by !== state.me.id;
  if (eventType === "INSERT" && byOther) {
    toast({ who: actor, title: `${actor?.name ?? "Ekip"} yeni ${KINDS[row.kind].plural} ekledi`, text: `${row.title} · ${whenText(row)}`, id: row.id });
  } else if (eventType === "UPDATE" && byOther && prev && MEANINGFUL.some((k) => String(prev[k]) !== String(row[k]))) {
    toast({ who: actor, title: `${actor?.name ?? "Ekip"} güncelledi`, text: row.title, id: row.id });
  }
  render();
}

/* ───────────────────────── Push bildirim ───────────────────────── */
function b64ToBytes(b64) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function pushState() {
  if (!CLOUD) return "demo";
  if (!pushSupported) return isIOS && !isStandalone ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}
async function subscribePush() {
  if (!CLOUD) { toast({ title: "Deneme modundasın", text: "Bildirimler Supabase bağlanınca çalışır." }); return false; }
  if (!VAPID_PUBLIC_KEY) { toast({ title: "Eksik ayar", text: "config.js içinde VAPID_PUBLIC_KEY boş." }); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast({ title: "Bildirim izni verilmedi", text: "Telefon ayarlarından açabilirsin." }); return false; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await sb.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: state.me.id });
  if (error) { toast({ title: "Kaydedilemedi", text: error.message }); return false; }
  toast({ title: "🔔 Bildirimler açık", text: "Ekip yeni bir şey eklediğinde haber vereceğiz." });
  return true;
}
async function unsubscribePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (sb) await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/* ───────────────────────── Metinler ───────────────────────── */
function whenText(ev) {
  const d = new Date(ev.starts_at);
  const day = relDay(dayKey(d), true);
  return ev.all_day ? `${day}, tüm gün` : `${day} ${timeStr(d)}`;
}
function relDay(key, short = false) {
  const diff = Math.round((fromKey(key) - fromKey(today())) / 864e5);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return fmt(fromKey(key), short ? { day: "numeric", month: "short", weekday: "short" } : { day: "numeric", month: "long" });
}
function timeRange(ev) {
  if (ev.all_day) return "Tüm gün";
  const s = new Date(ev.starts_at);
  if (!ev.ends_at) return timeStr(s);
  const e = new Date(ev.ends_at);
  return dayKey(s) === dayKey(e) ? `${timeStr(s)} – ${timeStr(e)}` : `${timeStr(s)} → ${fmt(e, { day: "numeric", month: "short" })} ${timeStr(e)}`;
}
function remindText(m) {
  const opt = REMIND_OPTIONS.find(([v]) => v === m);
  return opt ? opt[1] : `${m} dk önce`;
}

/* ───────────────────────── Görünüm ───────────────────────── */
const root = $("#root");

function visibleEvents() {
  return [...state.events.values()]
    .filter((e) => state.filter === "all" || e.kind === state.filter)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
}
function eventsByDay(list) {
  const map = new Map();
  for (const e of list) {
    // Birden fazla güne yayılan çekimler her günde görünsün
    const s = new Date(e.starts_at);
    const end = e.ends_at ? new Date(e.ends_at) : s;
    let d = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    for (let i = 0; i < 31 && d <= end; i++, d = addDays(d, 1)) {
      const k = dayKey(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(e);
    }
  }
  return map;
}
const dots = (list) => (list || []).slice(0, 3).map((e) => `<i class="k-${e.kind}"></i>`).join("");

// Üst başlık: Ajanda'da seçili haftanın, Ay görünümünde seçili ayın özeti
function periodSummary() {
  let from, to, label;
  if (state.view === "month") {
    from = state.month;
    to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
    const now = new Date();
    const diff = (from.getFullYear() - now.getFullYear()) * 12 + from.getMonth() - now.getMonth();
    label = { 0: "Bu ay", [-1]: "Geçen ay", 1: "Gelecek ay" }[diff] ?? fmt(from, { month: "long", year: from.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  } else {
    from = startOfWeek(fromKey(state.selected));
    to = addDays(from, 7);
    const diff = Math.round((from - startOfWeek(new Date())) / (7 * 864e5));
    const last = addDays(to, -1);
    label = { 0: "Bu hafta", [-1]: "Geçen hafta", 1: "Gelecek hafta" }[diff]
      ?? (from.getMonth() === last.getMonth() ? `${from.getDate()}–${last.getDate()} ${fmt(last, { month: "short" })}` : `${fmt(from, { day: "numeric", month: "short" })} – ${fmt(last, { day: "numeric", month: "short" })}`);
  }
  const inPeriod = [...state.events.values()].filter((e) => { const d = new Date(e.starts_at); return d >= from && d < to; });
  const count = (k) => inPeriod.filter((e) => e.kind === k).length;
  const parts = [];
  if (count("shoot")) parts.push(`<em>${count("shoot")} çekim</em>`);
  if (count("meeting")) parts.push(`${count("meeting")} toplantı`);
  if (count("rental")) parts.push(`${count("rental")} kiralama`);
  return parts.length ? `${esc(label)} ${parts.join(", ")}` : `${esc(label)} sakin`;
}

let lastAnimKey = "";
function render() {
  if (!state.me) return;
  const scrollY = window.scrollY;
  const animKey = [state.view, state.filter, state.selected, state.month.getTime()].join("|");
  const anim = animKey !== lastAnimKey;
  lastAnimKey = animKey;
  root.innerHTML = `
    <div class="app ${anim ? "anim" : ""}">
      <header class="top">
        <div class="top-row">
          <div>
            <div class="eyebrow"><span class="sync ${state.online ? "" : "off"}" id="sync"></span>${esc(fmt(new Date(), { weekday: "long", day: "numeric", month: "long" }))}${CLOUD ? "" : '<span class="badge-demo">Deneme</span>'}</div>
            <h1 class="title">${periodSummary()}</h1>
          </div>
          <button class="logo-btn" data-act="settings" aria-label="Ekip ve ayarlar"><img src="icons/icon-192.png" alt="" width="46" height="46"></button>
        </div>
        <div class="toolbar">
          <div class="seg" role="group">
            <button data-view="agenda" aria-pressed="${state.view === "agenda"}">Ajanda</button>
            <button data-view="month" aria-pressed="${state.view === "month"}">Ay</button>
          </div>
          <div class="chips">
            <button class="chip" data-filter="all" aria-pressed="${state.filter === "all"}">Tümü</button>
            ${Object.entries(KINDS).map(([k, v]) => `<button class="chip k-${k}" data-filter="${k}" aria-pressed="${state.filter === k}"><span class="dot"></span>${v.label}</button>`).join("")}
          </div>
        </div>
      </header>
      ${state.view === "agenda" ? renderWeek() : ""}
      <main class="content">
        ${promoCard()}
        ${state.view === "agenda" ? renderAgenda() : renderMonth()}
      </main>
      ${state.selected !== today() && state.view === "agenda" ? '<button class="today-pill" data-act="today">↺ Bugüne dön</button>' : ""}
      <button class="fab" data-act="new">${ICON.plus}Ekle</button>
    </div>`;
  window.scrollTo(0, scrollY);
}
function renderSync() { const el = $("#sync"); if (el) el.classList.toggle("off", !state.online); }

function renderWeek() {
  const sel = fromKey(state.selected);
  const ws = startOfWeek(sel);
  const byDay = eventsByDay(visibleEvents());
  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), k = dayKey(d);
    html += `<button class="wd ${k === today() ? "today" : ""}" data-day="${k}" aria-pressed="${k === state.selected}">
      <small>${fmt(d, { weekday: "short" }).slice(0, 3)}</small><b>${d.getDate()}</b><span class="dots">${dots(byDay.get(k))}</span></button>`;
  }
  return `<nav class="week">
    <button class="week-nav" data-week="-1" aria-label="Önceki hafta">${ICON.chevL}</button>
    <div class="week-days">${html}</div>
    <button class="week-nav" data-week="1" aria-label="Sonraki hafta">${ICON.chevR}</button>
  </nav>`;
}

function renderCard(e, i = 0) {
  const k = KINDS[e.kind];
  const who = state.profiles.get(e.created_by);
  const past = (e.ends_at ? new Date(e.ends_at) : new Date(e.starts_at)) < new Date() && !e.all_day;
  return `<button class="card k-${e.kind} ${e.done ? "is-done" : ""} ${past && !e.done ? "is-past" : ""}" data-open="${e.id}" style="animation-delay:${Math.min(i, 8) * 30}ms">
    <span class="card-icon">${k.emoji}</span>
    <span>
      <span class="card-time">${esc(timeRange(e))}${e.visibility === "private" ? ' <span class="private-tag">' + ICON.lock + "Kişisel</span>" : ""}${e.remind_minutes != null ? ` <span title="Hatırlatma: ${esc(remindText(e.remind_minutes))}">${ICON.bell}</span>` : ""}</span>
      <span class="card-title">${esc(e.title)}</span>
      ${e.location || e.notes ? `<span class="card-meta">${e.location ? `<span>${ICON.pin}${esc(e.location)}</span>` : ""}${e.notes ? `<span>${esc(e.notes.split("\n")[0].slice(0, 60))}</span>` : ""}</span>` : ""}
    </span>
    <span class="card-side">
      ${e.kind === "reminder" ? `<span class="check" role="checkbox" aria-checked="${!!e.done}" data-toggle="${e.id}" aria-label="Tamamlandı">${ICON.check}</span>` : "<span></span>"}
      ${who && state.profiles.size > 1 ? `<span class="avatar sm" style="--c:${esc(who.color)}" title="${esc(who.name)}">${esc(initials(who.name))}</span>` : ""}
    </span>
  </button>`;
}

function renderAgenda() {
  const byDay = eventsByDay(visibleEvents());
  const keys = [...byDay.keys()].filter((k) => k >= state.selected).sort().slice(0, 30);
  if (!byDay.has(state.selected)) keys.unshift(state.selected);
  let i = 0;
  const groups = keys.map((k) => {
    const list = byDay.get(k) || [];
    const isToday = k === today();
    const head = `<div class="day-head ${isToday ? "is-today" : ""}"><h2>${relDay(k)}</h2><span>${["Bugün", "Yarın", "Dün"].includes(relDay(k)) ? fmt(fromKey(k), { day: "numeric", month: "long", weekday: "long" }) : fmt(fromKey(k), { weekday: "long" })}</span></div>`;
    if (!list.length) {
      return `<section class="day-group">${head}${keys.length === 1 ? emptyState() : `<button class="card" data-act="new" data-date="${k}" style="grid-template-columns:1fr;box-shadow:none;background:transparent;border:1.5px dashed var(--line);color:var(--ink-3);font-weight:600;justify-content:center">Bu gün boş · eklemek için dokun</button>`}</section>`;
    }
    return `<section class="day-group">${head}${list.map((e) => renderCard(e, i++)).join("")}</section>`;
  });
  return groups.join("");
}

function emptyState() {
  const label = state.filter === "all" ? "girdi" : KINDS[state.filter].plural;
  return `<div class="empty"><div class="empty-art">🎬</div><h3>Henüz ${label} yok</h3><p>Çekim, toplantı ya da hatırlatıcı eklediğinde ekip arkadaşının telefonuna da anında düşer.</p></div>`;
}

function renderMonth() {
  const m = state.month;
  const first = startOfWeek(m);
  const byDay = eventsByDay(visibleEvents());
  let cells = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < 42; i++) {
    const d = addDays(first, i), k = dayKey(d);
    if (i === 35 && d.getMonth() !== m.getMonth()) break;
    cells += `<button class="md ${d.getMonth() !== m.getMonth() ? "out" : ""} ${k === today() ? "today" : ""}" data-mday="${k}" aria-pressed="${k === state.selected}">${d.getDate()}<span class="dots">${dots(byDay.get(k))}</span></button>`;
  }
  const list = byDay.get(state.selected) || [];
  return `<div class="month">
      <div class="month-head"><h2>${fmt(m, { month: "long", year: "numeric" })}</h2>
        <div class="nav"><button data-month="-1" aria-label="Önceki ay">${ICON.chevL}</button><button data-month="1" aria-label="Sonraki ay">${ICON.chevR}</button></div></div>
      <div class="month-grid">${cells}</div>
    </div>
    <section class="day-group"><div class="day-head ${state.selected === today() ? "is-today" : ""}"><h2>${relDay(state.selected)}</h2><span>${fmt(fromKey(state.selected), { weekday: "long" })}</span></div>
      ${list.length ? list.map(renderCard).join("") : `<button class="card" data-act="new" data-date="${state.selected}" style="grid-template-columns:1fr;box-shadow:none;background:transparent;border:1.5px dashed var(--line);color:var(--ink-3);font-weight:600">Bu gün boş · eklemek için dokun</button>`}
    </section>`;
}

function promoCard() {
  const dismissed = store.get("baret.promo", {});
  if (!isStandalone && !dismissed.install) {
    if (isIOS) {
      return `<div class="promo"><span class="promo-icon">📲</span><div class="promo-text"><b>Telefona uygulama olarak ekle</b>Safari'de ${ICON.share} Paylaş → <b style="display:inline">Ana Ekrana Ekle</b>. Bildirimler bundan sonra açılır.</div><button class="x" data-dismiss="install" aria-label="Kapat">${ICON.x}</button></div>`;
    }
    if (state.installEvent) {
      return `<div class="promo"><span class="promo-icon">📲</span><div class="promo-text"><b>Uygulamayı yükle</b>Ana ekrandan tek dokunuşla aç.</div><button class="btn btn-brand btn-sm" data-act="install">Yükle</button></div>`;
    }
  }
  if (CLOUD && pushSupported && Notification.permission === "default" && !dismissed.push) {
    return `<div class="promo"><span class="promo-icon">🔔</span><div class="promo-text"><b>Yeni girdilerden haberdar ol</b>Ekip bir şey eklediğinde telefonuna bildirim düşsün.</div><button class="btn btn-brand btn-sm" data-act="push-on">Aç</button></div>`;
  }
  return "";
}

/* ───────────────────────── Sheet (alt panel) ───────────────────────── */
const layer = $("#sheet-layer");
const sheetBody = $(".sheet-body", layer);
function openSheet(html, onMount) {
  sheetBody.innerHTML = html;
  sheetBody.scrollTop = 0;
  layer.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { sheetBody.scrollTop = 0; layer.classList.add("open"); }));
  document.body.style.overflow = "hidden";
  onMount?.(sheetBody);
}
function closeSheet() {
  layer.classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(() => { if (!layer.classList.contains("open")) { layer.hidden = true; sheetBody.innerHTML = ""; } }, 320);
  if (location.search) history.replaceState(null, "", location.pathname);
}
layer.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !layer.hidden) closeSheet(); });

// Aşağı kaydırarak kapatma
(() => {
  const sheet = $(".sheet", layer);
  let y0 = null, dy = 0;
  sheet.addEventListener("touchstart", (e) => { if (sheetBody.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.style.transition = "none"; sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sheet.addEventListener("touchend", () => {
    sheet.style.transition = ""; sheet.style.transform = "";
    if (y0 != null && dy > 110) closeSheet();
    y0 = null;
  });
})();

function eventForm(ev) {
  const isNew = !ev.id;
  const s = new Date(ev.starts_at);
  const e = ev.ends_at ? new Date(ev.ends_at) : null;
  const creator = state.profiles.get(ev.created_by);
  const editor = state.profiles.get(ev.updated_by);
  return `
    <div class="sheet-title"><h2>${isNew ? "Yeni girdi" : "Düzenle"}</h2><button class="icon-btn" data-close aria-label="Kapat">${ICON.x}</button></div>
    <form id="ev-form" autocomplete="off">
      <div class="kinds">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="kind k-${k}" data-kind="${k}" aria-pressed="${ev.kind === k}"><span>${v.emoji}</span>${v.label}</button>`).join("")}</div>
      <div class="group">
        <div class="row"><input class="field title-input" name="title" placeholder="${PLACEHOLDER[ev.kind]}" value="${esc(ev.title)}" maxlength="200" required></div>
        <div class="row"><span class="ico">${ICON.pin}</span><input class="field" name="location" placeholder="Konum ekle" value="${esc(ev.location)}"></div>
      </div>
      <div class="group">
        <div class="row"><span class="lbl">Tüm gün</span><label class="switch"><input type="checkbox" name="all_day" ${ev.all_day ? "checked" : ""}><i></i></label></div>
        <div class="row"><label for="f-date">Tarih</label><input class="field" id="f-date" type="date" name="date" value="${dayKey(s)}" required></div>
        <div class="row time-row" ${ev.all_day ? "hidden" : ""}><label>Saat</label><div class="times"><input class="field" type="time" name="start" value="${timeStr(s)}" aria-label="Başlangıç"><span class="sep">–</span><input class="field" type="time" name="end" value="${e ? timeStr(e) : ""}" aria-label="Bitiş"></div></div>
        <div class="row end-date-row" ${MULTI_DAY[ev.kind] ? "" : "hidden"}><label for="f-end">${MULTI_DAY[ev.kind] || "Bitiş günü"}</label><input class="field" id="f-end" type="date" name="end_date" value="${e && dayKey(e) !== dayKey(s) ? dayKey(e) : ""}" min="${dayKey(s)}"></div>
      </div>
      <div class="group">
        <div class="row" style="align-items:flex-start"><span class="lbl" style="padding-top:18px">Hatırlat</span>
          <div class="pills">${REMIND_OPTIONS.map(([v, l]) => `<button type="button" class="pill" data-remind="${v}" aria-pressed="${ev.remind_minutes === v}">${l}</button>`).join("")}</div></div>
      </div>
      <div class="group vis-group" ${ev.kind === "reminder" ? "" : "hidden"}>
        <div class="row"><span class="lbl">Kimler görsün</span>
          <div class="vis-seg" role="radiogroup">
            <button type="button" class="vis" data-vis="team" aria-pressed="${ev.visibility !== "private"}"><b>👥 Ekip</b><small>Herkes görür, bildirim gider</small></button>
            <button type="button" class="vis" data-vis="private" aria-pressed="${ev.visibility === "private"}"><b>🔒 Sadece ben</b><small>Kişisel, kimse görmez</small></button>
          </div></div>
      </div>
      <div class="group"><div class="row"><textarea class="field" name="notes" placeholder="Notlar: ekipman listesi, oyuncular, call sheet linki…">${esc(ev.notes)}</textarea></div></div>
      ${!isNew && creator ? `<p class="meta-line">${esc(creator.name)} ekledi${editor && ev.updated_by !== ev.created_by ? ` · ${esc(editor.name)} düzenledi` : ""} · ${fmt(new Date(ev.updated_at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>` : ""}
      <div class="actions">
        <button class="btn btn-primary" type="submit">${submitLabel(ev)}</button>
        ${!isNew ? '<button class="btn btn-danger" type="button" data-act="delete">Sil</button>' : ""}
      </div>
    </form>`;
}

function submitLabel(ev) {
  if (ev.id) return "Değişiklikleri kaydet";
  return isPrivate(ev) ? "Kaydet" : "Kaydet ve ekibe bildir";
}
const isPrivate = (ev) => ev.kind === "reminder" && ev.visibility === "private";

function openEvent(ev) {
  let draft = { ...ev };
  openSheet(eventForm(draft), (body) => {
    const form = $("#ev-form", body);
    if (!draft.id) setTimeout(() => form.title.focus(), 350);

    body.addEventListener("click", async (e) => {
      const kindBtn = e.target.closest("[data-kind]");
      if (kindBtn) {
        const prevKind = draft.kind;
        draft.kind = kindBtn.dataset.kind;
        body.querySelectorAll("[data-kind]").forEach((b) => b.setAttribute("aria-pressed", b === kindBtn));
        form.title.placeholder = PLACEHOLDER[draft.kind];
        $(".end-date-row", body).hidden = !MULTI_DAY[draft.kind];
        if (MULTI_DAY[draft.kind]) $(".end-date-row label", body).textContent = MULTI_DAY[draft.kind];
        if (!draft.id && draft.remind_minutes === DEFAULT_REMIND[prevKind]) setRemind(DEFAULT_REMIND[draft.kind]);
        $(".vis-group", body).hidden = draft.kind !== "reminder";
        if (!draft.id && draft.kind === "reminder") form.end.value = ""; // hatırlatıcı tek anlık
        form.querySelector('[type="submit"]').textContent = submitLabel(draft);
        return;
      }
      const visBtn = e.target.closest("[data-vis]");
      if (visBtn) {
        draft.visibility = visBtn.dataset.vis;
        body.querySelectorAll("[data-vis]").forEach((b) => b.setAttribute("aria-pressed", b === visBtn));
        form.querySelector('[type="submit"]').textContent = submitLabel(draft);
        return;
      }
      const remindBtn = e.target.closest("[data-remind]");
      if (remindBtn) { setRemind(remindBtn.dataset.remind === "null" ? null : Number(remindBtn.dataset.remind)); return; }
      if (e.target.closest('[data-act="delete"]')) {
        if (!confirm(`“${draft.title}” silinsin mi? Ekipteki herkes için silinir.`)) return;
        try { await backend.remove(draft); closeSheet(); render(); toast({ title: "Silindi", text: draft.title }); }
        catch (err) { toast({ title: "Silinemedi", text: err.message }); }
      }
    });
    function setRemind(v) {
      draft.remind_minutes = v;
      body.querySelectorAll("[data-remind]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.remind) === String(v)));
    }
    form.all_day.addEventListener("change", () => { $(".time-row", body).hidden = form.all_day.checked; });
    form.date.addEventListener("change", () => { form.end_date.min = form.date.value; });
    form.start.addEventListener("change", () => {
      // Bitiş saati yoksa ya da başlangıçtan önce kaldıysa 1 saat sonrasına çek
      if (draft.kind !== "reminder" && (!form.end.value || form.end.value <= form.start.value)) {
        const [h, m] = form.start.value.split(":").map(Number);
        form.end.value = `${pad(Math.min(h + 1, 23))}:${pad(m)}`;
      }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const allDay = form.all_day.checked;
      const [y, mo, d] = fd.get("date").split("-").map(Number);
      const [sh, sm] = allDay ? [0, 0] : (fd.get("start") || "09:00").split(":").map(Number);
      const start = new Date(y, mo - 1, d, sh, sm);
      let end = null;
      const endDate = MULTI_DAY[draft.kind] && fd.get("end_date") ? fd.get("end_date").split("-").map(Number) : [y, mo, d];
      if (allDay) {
        if (MULTI_DAY[draft.kind] && fd.get("end_date") && fd.get("end_date") > fd.get("date")) end = new Date(endDate[0], endDate[1] - 1, endDate[2], 23, 59);
      } else if (fd.get("end")) {
        const [eh, em] = fd.get("end").split(":").map(Number);
        end = new Date(endDate[0], endDate[1] - 1, endDate[2], eh, em);
        if (end <= start) end = null;
      }
      const payload = {
        ...draft,
        title: fd.get("title").trim(),
        location: fd.get("location").trim() || null,
        notes: fd.get("notes").trim() || null,
        all_day: allDay,
        visibility: isPrivate(draft) ? "private" : "team",
        starts_at: start.toISOString(),
        ends_at: end ? end.toISOString() : null,
      };
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true; btn.textContent = "Kaydediliyor…";
      try {
        const saved = await backend.save(payload);
        closeSheet();
        state.selected = dayKey(new Date(saved.starts_at));
        state.month = new Date(start.getFullYear(), start.getMonth(), 1);
        render();
        toast({ title: `${KINDS[saved.kind].emoji} ${draft.id ? "Güncellendi" : "Eklendi"}`, text: saved.visibility === "private" ? "Kişisel: sadece sen görüyorsun." : CLOUD ? "Ekip arkadaşına bildirim gitti." : saved.title });
      } catch (err) {
        btn.disabled = false; btn.textContent = "Tekrar dene";
        toast({ title: "Kaydedilemedi", text: err.message });
      }
    });
  });
}

function newEvent(date = state.selected, kind = state.filter !== "all" ? state.filter : "shoot") {
  const d = fromKey(date);
  const now = new Date();
  const hour = date === today() && now.getHours() >= 7 && now.getHours() < 22 ? now.getHours() + 1 : 9;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0);
  openEvent({ kind, title: "", starts_at: start.toISOString(), ends_at: kind === "reminder" ? null : new Date(start.getTime() + 36e5).toISOString(), all_day: false, location: "", notes: "", remind_minutes: DEFAULT_REMIND[kind], done: false, visibility: "team" });
}

/* ───────────────────────── Ayarlar ───────────────────────── */
async function openSettings() {
  const ps = await pushState();
  const icalUrl = CLOUD && state.me.ical_token ? `${SUPABASE_URL.replace(/^https?:\/\//, "webcal://")}/functions/v1/ical?token=${state.me.ical_token}` : null;
  const pushRow = {
    on: ["🔔", "Bildirimler açık", "Ekip yeni girdi eklediğinde ve hatırlatma zamanı gelince haber verilir.", '<button class="btn btn-soft btn-sm" data-act="push-off">Kapat</button>'],
    off: ["🔕", "Bildirimler kapalı", "Yeni girdiler ve hatırlatmalar için aç.", '<button class="btn btn-brand btn-sm" data-act="push-on">Aç</button>'],
    denied: ["🚫", "Bildirim izni engelli", "Telefon Ayarları → Bildirimler → Baret'ten izin ver.", ""],
    "needs-install": ["📲", "Önce ana ekrana ekle", "iPhone'da bildirimler, uygulama ana ekrandan açılınca çalışır.", ""],
    demo: ["🧪", "Deneme modunda kapalı", "Supabase bağlanınca ekip bildirimleri burada açılır.", ""],
    unsupported: ["⚠️", "Bu tarayıcı bildirim desteklemiyor", "Telefonda Safari (iOS 16.4+) ya da Chrome kullan.", ""],
  }[ps];
  openSheet(`
    <div class="sheet-title"><h2>Ekip</h2><button class="icon-btn" data-close aria-label="Kapat">${ICON.x}</button></div>
    <div class="group">
      <div class="profile-card"><span class="avatar" id="pf-avatar" style="--c:${esc(state.me.color)}">${esc(initials(state.me.name))}</span>
        <div style="flex:1;min-width:0"><input class="field" id="pf-name" value="${esc(state.me.name)}" maxlength="40" style="padding:4px 0;font-weight:700;font-size:18px;border-bottom:1.5px dashed var(--line)" aria-label="Adın"><small style="color:var(--ink-3)">Adına dokunup değiştir, aşağıdan rengini seç. Ekip seni böyle görür.</small></div></div>
      <div class="row"><div class="swatches">${COLORS.map((c) => `<button class="swatch" style="--c:${c}" data-color="${c}" aria-pressed="${c === state.me.color}" aria-label="Renk"></button>`).join("")}</div></div>
    </div>

    ${state.profiles.size > 1 ? `<div class="section-label">Ekip üyeleri · ${state.profiles.size}</div>
    <div class="group">${[...state.profiles.values()].sort((x, y) => (x.id === state.me.id ? -1 : y.id === state.me.id ? 1 : x.name.localeCompare(y.name, LOCALE))).map((p) => `
      <div class="set-row"><span class="avatar" style="--c:${esc(p.color)};border:0">${esc(initials(p.name))}</span><div class="txt"><b>${esc(p.name)}${p.id === state.me.id ? ' <small style="display:inline;color:var(--ink-3)">· sen</small>' : ""}</b></div></div>`).join("")}
    </div>` : ""}

    <div class="section-label">Bildirimler</div>
    <div class="group"><div class="set-row"><span class="emo">${pushRow[0]}</span><div class="txt"><b>${pushRow[1]}</b><small>${pushRow[2]}</small></div>${pushRow[3]}</div></div>

    <div class="section-label">iPhone Takvimi</div>
    <div class="group">
      ${icalUrl ? `
      <div class="set-row"><span class="emo">📅</span><div class="txt"><b>Apple Takvim'e abone ol</b><small>Tüm ajanda iPhone Takvimi'nde görünür ve kendiliğinden güncellenir. Düzenlemeleri burada yap.</small></div></div>
      <div class="set-row" style="gap:8px"><a class="btn btn-brand" href="${esc(icalUrl)}" style="text-decoration:none">Takvime ekle</a><button class="btn btn-soft btn-sm" data-copy="${esc(icalUrl.replace("webcal://", "https://"))}" style="min-height:54px">Linki kopyala</button></div>
      <ol class="steps"><li>“Takvime ekle”ye dokun, açılan pencerede <b>Abone Ol</b> de.</li><li>Güncelleme sıklığı için: Ayarlar → Takvim → Hesaplar → Abone Olunan Takvimler → <b>Her 15 dakikada</b>.</li><li>Google Takvim için kopyaladığın linki “URL ile ekle”ye yapıştır.</li></ol>` : `
      <div class="set-row"><span class="emo">📅</span><div class="txt"><b>Takvim aboneliği</b><small>Supabase bağlandığında burada kişisel takvim linkin çıkar.</small></div></div>`}
    </div>

    ${!isStandalone ? `
    <div class="section-label">Telefona yükle</div>
    <div class="group"><ol class="steps" style="padding-top:14px">
      <li><b>iPhone:</b> Safari'de bu sayfayı aç → <span class="kbd">${ICON.share}</span> Paylaş → <b>Ana Ekrana Ekle</b>.</li>
      <li><b>Android:</b> Chrome menüsü <span class="kbd">⋮</span> → <b>Uygulamayı yükle</b>.</li>
      <li>Ekip arkadaşına bu sayfanın linkini gönder, o da kendi hesabıyla kaydolsun.</li></ol></div>` : ""}

    <div class="section-label">Hesap</div>
    <div class="group">
      <div class="set-row"><span class="emo">${CLOUD ? "☁️" : "🧪"}</span><div class="txt"><b>${CLOUD ? "Bulut senkron açık" : "Deneme modu"}</b><small>${CLOUD ? `${state.profiles.size} kişilik ekip · değişiklikler anında herkese gider` : "Veriler sadece bu cihazda. Ekip senkronu için Supabase'i bağla (KURULUM.md)."}</small></div></div>
      ${CLOUD ? '<div class="set-row"><button class="btn btn-danger" data-act="signout" style="min-height:40px">Çıkış yap</button></div>' : '<div class="set-row"><button class="btn btn-danger" data-act="reset-demo" style="min-height:40px">Deneme verilerini sıfırla</button></div>'}
    </div>
  `, (body) => {
    const nameInput = $("#pf-name", body);
    let color = state.me.color;
    const saveProfile = async () => {
      const name = nameInput.value.trim() || state.me.name;
      if (name === state.me.name && color === state.me.color) return;
      try { await backend.updateProfile({ name, color }); render(); } catch (err) { toast({ title: "Kaydedilemedi", text: err.message }); }
    };
    nameInput.addEventListener("input", () => { $("#pf-avatar", body).textContent = initials(nameInput.value); });
    nameInput.addEventListener("change", saveProfile);
    body.addEventListener("click", async (e) => {
      const sw = e.target.closest("[data-color]");
      if (sw) {
        color = sw.dataset.color;
        body.querySelectorAll("[data-color]").forEach((b) => b.setAttribute("aria-pressed", b === sw));
        $("#pf-avatar", body).style.setProperty("--c", color);
        saveProfile();
      }
      const copy = e.target.closest("[data-copy]");
      if (copy) { await navigator.clipboard?.writeText(copy.dataset.copy); toast({ title: "Kopyalandı", text: "Takvim linki panoda." }); }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "push-on") { if (await subscribePush()) openSettings(); }
      if (act === "push-off") { await unsubscribePush(); toast({ title: "Bildirimler kapatıldı" }); openSettings(); }
      if (act === "signout") backend.signOut();
      if (act === "reset-demo" && confirm("Deneme verileri silinip örnek ajanda yeniden yüklensin mi?")) { localStorage.removeItem(demoBackend.KEY); location.reload(); }
    });
  });
}

/* ───────────────────────── Toast ───────────────────────── */
function toast({ title, text = "", who = null, id = null }) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `${who ? `<span class="avatar" style="--c:${esc(who.color)}">${esc(initials(who.name))}</span>` : ""}<div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}</div>`;
  if (id) { el.style.cursor = "pointer"; el.onclick = () => { const ev = state.events.get(id); if (ev) openEvent(ev); }; }
  $("#toasts").append(el);
  if (navigator.vibrate && who) navigator.vibrate(12);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 260); }, 3800);
}

/* ───────────────────────── Giriş ekranı ───────────────────────── */
function renderAuth(mode = "login", msg = "", isErr = false) {
  root.innerHTML = `
    <div class="auth">
      <img class="auth-logo" src="icons/icon-192.png" alt="">
      <h1>Baret Ajanda</h1>
      <p class="lead">Çekim takvimi, toplantılar ve hatırlatıcılar. Tüm ekip aynı sayfada.</p>
      <div class="auth-tabs" role="group">
        <button data-mode="login" aria-pressed="${mode === "login"}">Giriş yap</button>
        <button data-mode="signup" aria-pressed="${mode === "signup"}">Kaydol</button>
      </div>
      <form id="auth-form">
        ${mode === "signup" ? '<div class="group" style="margin:0"><div class="row"><input class="field" name="name" placeholder="Adın (ekip böyle görecek)" required maxlength="40" autocomplete="name"></div></div>' : ""}
        <div class="group" style="margin:0">
          <div class="row"><input class="field" name="email" type="email" placeholder="E-posta" required autocomplete="email"></div>
          <div class="row"><input class="field" name="password" type="password" placeholder="Şifre (en az 6 karakter)" required minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}"></div>
        </div>
        ${msg ? `<div class="msg ${isErr ? "err" : ""}">${esc(msg)}</div>` : ""}
        <button class="btn btn-brand" type="submit">${mode === "signup" ? "Hesap oluştur" : "Giriş yap"}</button>
      </form>
    </div>`;
  root.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => renderAuth(b.dataset.mode)));
  $("#auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;
    const email = fd.get("email").trim(), password = fd.get("password");
    let res;
    if (mode === "signup") {
      res = await sb.auth.signUp({ email, password, options: { data: { name: fd.get("name").trim(), color: COLORS[Math.floor(Math.random() * COLORS.length)] }, emailRedirectTo: location.href.split("?")[0] } });
      if (!res.error && !res.data.session) return renderAuth("login", "Hesabın oluştu. E-postana gelen onay linkine dokun, sonra buradan giriş yap.");
    } else {
      res = await sb.auth.signInWithPassword({ email, password });
    }
    if (res.error) {
      const m = res.error.message;
      const tr = /invalid login/i.test(m) ? "E-posta ya da şifre hatalı." : /signups not allowed/i.test(m) ? "Yeni kayıtlar kapalı. Ekip yöneticisine sor." : /already registered/i.test(m) ? "Bu e-posta zaten kayıtlı, giriş yap." : /email not confirmed/i.test(m) ? "Önce e-postandaki onay linkine dokun." : m;
      return renderAuth(mode, tr, true);
    }
    location.reload();
  };
}

/* ───────────────────────── Olaylar ───────────────────────── */
root.addEventListener("click", async (e) => {
  const t = e.target;
  const toggle = t.closest("[data-toggle]");
  if (toggle) {
    e.stopPropagation();
    const ev = state.events.get(toggle.dataset.toggle);
    const updated = { ...ev, done: !ev.done };
    state.events.set(ev.id, updated); render();
    if (updated.done && navigator.vibrate) navigator.vibrate(10);
    try { await backend.save(updated); } catch (err) { state.events.set(ev.id, ev); render(); toast({ title: "Kaydedilemedi", text: err.message }); }
    return;
  }
  const open = t.closest("[data-open]");
  if (open) return openEvent(state.events.get(open.dataset.open));
  const day = t.closest("[data-day]");
  if (day) { state.selected = day.dataset.day; return render(); }
  const mday = t.closest("[data-mday]");
  if (mday) {
    state.selected = mday.dataset.mday;
    const d = fromKey(state.selected);
    if (d.getMonth() !== state.month.getMonth()) state.month = new Date(d.getFullYear(), d.getMonth(), 1);
    return render();
  }
  const wk = t.closest("[data-week]");
  if (wk) { state.selected = dayKey(addDays(fromKey(state.selected), 7 * Number(wk.dataset.week))); return render(); }
  const mo = t.closest("[data-month]");
  if (mo) { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + Number(mo.dataset.month), 1); return render(); }
  const view = t.closest("[data-view]");
  if (view) { state.view = view.dataset.view; store.set("baret.view", state.view); return render(); }
  const filter = t.closest("[data-filter]");
  if (filter) { state.filter = filter.dataset.filter; return render(); }
  const dismiss = t.closest("[data-dismiss]");
  if (dismiss) { store.set("baret.promo", { ...store.get("baret.promo", {}), [dismiss.dataset.dismiss]: true }); return render(); }
  const act = t.closest("[data-act]");
  if (!act) return;
  switch (act.dataset.act) {
    case "new": return newEvent(act.dataset.date || state.selected);
    case "settings": return openSettings();
    case "today": state.selected = today(); return render();
    case "push-on": if (await subscribePush()) render(); return;
    case "install":
      state.installEvent?.prompt();
      await state.installEvent?.userChoice;
      state.installEvent = null;
      return render();
  }
});

// Haftayı kaydırarak değiştirme
(() => {
  let x0 = null, y0 = 0;
  root.addEventListener("touchstart", (e) => { if (e.target.closest(".week, .month")) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
  root.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    const dir = dx < 0 ? 1 : -1;
    if (state.view === "agenda") state.selected = dayKey(addDays(fromKey(state.selected), 7 * dir));
    else state.month = new Date(state.month.getFullYear(), state.month.getMonth() + dir, 1);
    render();
  });
})();

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); state.installEvent = e; render(); });

function handleUrl(href = location.href) {
  const p = new URL(href).searchParams;
  const id = p.get("event");
  if (id && state.events.get(id)) {
    const ev = state.events.get(id);
    state.selected = dayKey(new Date(ev.starts_at)); render(); openEvent(ev);
  } else if (p.get("new")) newEvent();
}

/* ───────────────────────── Örnek veri (deneme modu) ───────────────────────── */
function seed() {
  const at = (dd, h, m = 0) => { const d = addDays(new Date(), dd); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const base = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), done: false, reminded: false };
  return [
    { ...base, id: crypto.randomUUID(), kind: "meeting", title: "Ön prodüksiyon toplantısı", starts_at: at(0, 11), ends_at: at(0, 12, 30), all_day: false, location: "Ofis · toplantı odası", notes: "Senaryo son hali, lokasyon listesi, bütçe", remind_minutes: 15, created_by: "demo-2", updated_by: "demo-2" },
    { ...base, id: crypto.randomUUID(), kind: "reminder", visibility: "private", title: "Kiralama faturasını onayla", starts_at: at(0, 16), ends_at: null, all_day: false, location: null, notes: null, remind_minutes: 0, created_by: "demo", updated_by: "demo" },
    { ...base, id: crypto.randomUUID(), kind: "rental", title: "Arri Alexa + lens seti", starts_at: at(0, 18), ends_at: at(2, 10), all_day: false, location: "Rent House · Şişli", notes: "Depozito ödendi\nİadede batarya sayısını kontrol et", remind_minutes: 60, created_by: "demo", updated_by: "demo" },
    { ...base, id: crypto.randomUUID(), kind: "shoot", title: "Kahve markası reklam çekimi", starts_at: at(1, 7, 30), ends_at: at(1, 19), all_day: false, location: "Kadıköy · Stüdyo 4", notes: "Call time 07:30\nYemek: 13:00", remind_minutes: 1440, created_by: "demo", updated_by: "demo" },
    { ...base, id: crypto.randomUUID(), kind: "shoot", title: "Klip çekimi – dış mekan", starts_at: at(3, 0), ends_at: at(4, 23, 59), all_day: true, location: "Şile sahili", notes: "Hava durumu yedeği: 6 gün sonrası", remind_minutes: 1440, created_by: "demo-2", updated_by: "demo-2" },
    { ...base, id: crypto.randomUUID(), kind: "meeting", title: "Müşteriyle ofline izleme", starts_at: at(5, 14), ends_at: at(5, 15), all_day: false, location: "Online · Meet", notes: null, remind_minutes: 60, created_by: "demo", updated_by: "demo" },
    { ...base, id: crypto.randomUUID(), kind: "reminder", title: "Oyuncu sözleşmelerini topla", starts_at: at(2, 10), ends_at: null, all_day: false, location: null, notes: null, remind_minutes: 0, created_by: "demo-2", updated_by: "demo-2" },
  ];
}

/* ───────────────────────── Başlat ───────────────────────── */
async function boot() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW", e));
    navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.type === "open") handleUrl(e.data.url); });
  }
  backend = CLOUD ? cloudBackend : demoBackend;
  try {
    const ok = await backend.init();
    if (!ok) return renderAuth();
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="auth"><h1>Bağlanamadı</h1><p class="lead">${esc(err.message)}</p><button class="btn btn-brand" onclick="location.reload()">Tekrar dene</button></div>`;
    return;
  }
  render();
  handleUrl();
  // Gün değişince başlıkları tazele
  setInterval(() => { if (!document.hidden && layer.hidden) render(); }, 60_000);
}
boot();
