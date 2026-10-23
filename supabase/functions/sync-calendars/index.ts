// Pulls every calendar feed (secret iCal address) in `calendar_sources` and mirrors its events
// into `events` for a window of 30 days back to 180 days ahead. Recurring events are expanded.
// Triggered every 15 minutes by pg_cron, and on demand from the site ("Sincronizar agora").
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import ICAL from "npm:ical.js@1.5.0";

const DAY = 86_400_000;

type Row = {
  id: string; source_id: string; who: string; title: string;
  starts_at: string; ends_at: string | null; all_day: boolean; location: string | null; synced_at: string;
};

function toIso(t: ICAL.Time): string {
  // All-day values become midnight UTC of that date (the site reads the date part only);
  // timed events carry their own zone from the feed's VTIMEZONE.
  if (t.isDate) return `${t.toString()}T00:00:00Z`;
  return t.toJSDate().toISOString();
}

function expand(ics: string, src: { id: string; who: string }, from: Date, to: Date): Row[] {
  const comp = new ICAL.Component(ICAL.parse(ics));
  for (const tz of comp.getAllSubcomponents("vtimezone")) {
    try { ICAL.TimezoneService.register(tz); } catch { /* already registered */ }
  }
  const vevents = comp.getAllSubcomponents("vevent");
  const now = new Date().toISOString();
  const rows: Row[] = [];
  const overrides = new Map<string, ICAL.Event>();
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) overrides.set(`${ev.uid}|${ev.recurrenceId.toString()}`, ev);
  }
  for (const v of vevents) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) continue;
    if (String(v.getFirstPropertyValue("status") || "").toUpperCase() === "CANCELLED") continue;
    const allDay = ev.startDate.isDate;
    const push = (start: ICAL.Time, end: ICAL.Time | null, e: ICAL.Event) => {
      const s = start.toJSDate();
      if (s > to) return false;
      const en = end ? end.toJSDate() : s;
      if (en < from) return true;
      rows.push({
        id: `${src.id}:${e.uid}:${start.toString()}`.slice(0, 500),
        source_id: src.id, who: src.who,
        title: e.summary || "(sem título)",
        starts_at: toIso(start), ends_at: end ? toIso(end) : null,
        all_day: allDay, location: e.location || null, synced_at: now,
      });
      return true;
    };
    if (!ev.isRecurring()) { push(ev.startDate, ev.endDate, ev); continue; }
    const it = ev.iterator();
    let next: ICAL.Time | null; let guard = 0;
    while ((next = it.next()) && guard++ < 1000) {
      const o = overrides.get(`${ev.uid}|${next.toString()}`);
      const det = o ? { startDate: o.startDate, endDate: o.endDate, e: o } : (() => {
        const d = ev.getOccurrenceDetails(next!); return { startDate: d.startDate, endDate: d.endDate, e: ev };
      })();
      if (!push(det.startDate, det.endDate, det.e)) break;
    }
  }
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(r.id) && seen.add(r.id));
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const from = new Date(Date.now() - 30 * DAY), to = new Date(Date.now() + 180 * DAY);
  const { data: sources, error } = await sb.from("calendar_sources").select("id, who, label, ics_url");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  const report: Record<string, unknown>[] = [];
  for (const src of sources ?? []) {
    try {
      const url = src.ics_url.replace(/^webcal:/i, "https:");
      const res = await fetch(url, { headers: { "user-agent": "casa-pereira-silva-sync" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = expand(await res.text(), src, from, to);
      // Replace this source's events inside the window.
      await sb.from("events").delete().eq("source_id", src.id).gte("starts_at", from.toISOString());
      for (let i = 0; i < rows.length; i += 500) {
        const { error: e } = await sb.from("events").upsert(rows.slice(i, i + 500));
        if (e) throw new Error(e.message);
      }
      await sb.from("calendar_sources").update({ last_sync: new Date().toISOString(), last_error: null }).eq("id", src.id);
      report.push({ source: src.label, events: rows.length });
    } catch (e) {
      await sb.from("calendar_sources").update({ last_error: String(e).slice(0, 300) }).eq("id", src.id);
      report.push({ source: src.label, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, report }), { headers: { "content-type": "application/json" } });
});
