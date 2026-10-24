// Baret Ajanda – "ical" fonksiyonu
// iPhone Takvimi (ve Google/Outlook) için abone olunabilir takvim akışı üretir.
// Adres: webcal://PROJE_REF.supabase.co/functions/v1/ical?token=KULLANICI_TOKENI
// Bu fonksiyonda "Verify JWT" KAPALI olmalı (takvim uygulamaları giriş yapamaz; erişim kişisel token ile).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TZ = "Europe/Istanbul";
const EMOJI: Record<string, string> = { rental: "📦", shoot: "🎬", meeting: "🤝", reminder: "⏰" };
const LABEL: Record<string, string> = { rental: "Kiralama", shoot: "Çekim", meeting: "Toplantı", reminder: "Hatırlatıcı" };

const enc = new TextEncoder();

// RFC 5545: satırlar 75 baytı geçmemeli, devam satırı boşlukla başlar
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function localDate(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}`;
}

function nextDay(yyyymmdd: string) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1));
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("token gerekli", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("profiles").select("id").eq("ical_token", token).maybeSingle();
  if (!me) return new Response("geçersiz token", { status: 404 });

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: events }, { data: people }] = await Promise.all([
    admin.from("events").select("*").gte("starts_at", since)
      .or(`visibility.eq.team,created_by.eq.${me.id}`).order("starts_at"),
    admin.from("profiles").select("id,name"),
  ]);
  const names = new Map((people ?? []).map((p) => [p.id, p.name]));

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Baret Ajanda//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Baret Ajanda",
    `X-WR-TIMEZONE:${TZ}`,
    "X-APPLE-CALENDAR-COLOR:#FFB800",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  for (const ev of events ?? []) {
    const start = new Date(ev.starts_at);
    const end = ev.ends_at ? new Date(ev.ends_at) : new Date(start.getTime() + (ev.kind === "reminder" ? 15 : 60) * 60_000);
    const desc = [
      ev.visibility === "private" ? `${LABEL[ev.kind] ?? ""} · kişisel` : `${LABEL[ev.kind] ?? ""} · ekleyen: ${names.get(ev.created_by) ?? "?"}`,
      ev.notes ?? "",
    ].filter(Boolean).join("\n\n");

    lines.push("BEGIN:VEVENT", `UID:${ev.id}@baret-ajanda`, `DTSTAMP:${utc(new Date(ev.updated_at))}`,
      `LAST-MODIFIED:${utc(new Date(ev.updated_at))}`);
    if (ev.all_day) {
      const day = localDate(start);
      const endDay = ev.ends_at ? nextDay(localDate(end)) : nextDay(day);
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${endDay}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`);
    }
    lines.push(
      `SUMMARY:${esc(`${EMOJI[ev.kind] ?? ""} ${ev.title}`.trim())}`,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${esc(LABEL[ev.kind] ?? "")}`,
    );
    if (ev.location) lines.push(`LOCATION:${esc(ev.location)}`);
    if (ev.remind_minutes != null && !ev.done) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(ev.title)}`,
        `TRIGGER:-PT${ev.remind_minutes}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="baret-ajanda.ics"',
      "Cache-Control": "no-cache",
    },
  });
});
