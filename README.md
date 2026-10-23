# Casa Pereira Silva

Private family home OS for Alexandre and Rita: today view, shared agenda (synced from Google/iCloud calendars), finances by 20-to-19 cycles, shopping list, tasks and goals.

## Stack (all free tiers)

- **Static site** (`index.html`, `styles.css`, `app.js`) hosted on Render.
- **Supabase** for Postgres, magic-link login, realtime and the calendar sync function.
- No build step, no frameworks. `@supabase/supabase-js` is loaded from jsDelivr.

## Security

- Every table has RLS: only emails listed in `members` can read or write.
- `config.js` holds the project URL and the publishable key, which are safe to expose.
- Calendar feeds are secret iCal URLs stored in `calendar_sources` (members-only).

## Calendar sync

`supabase/functions/sync-calendars` fetches every feed in `calendar_sources`, expands recurring events and mirrors them into `events` (30 days back, 180 days ahead). `pg_cron` runs it every 15 minutes; the site can also trigger it ("Sincronizar").

## Supabase setup

1. Run `supabase/schema.sql`.
2. Deploy the function: `supabase functions deploy sync-calendars`.
3. Authentication → URL Configuration → set **Site URL** to the Render URL.
