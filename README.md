# Biblo

An expense tracker with no forms to fill in and no bank connection.

You type what you spent, the way you'd say it out loud. The app reads the
amount and picks the category on its own, instantly. Whatever it can't read —
a receipt photo, a note with no number in it — waits for Claude Code, which
sorts it out the next time you ask.

There is no LLM API key anywhere in this. The app never calls a model.

## Run it

    npm run dev        # http://localhost:5190
    npm run check      # icons resolve, budget caps add up
    npm run build

## Adding expenses

Open the **chat** (the round button, bottom right) and type. All of these work:

    5k fuel
    2,000 lunch at the place
    barber 5000
    paid mum 100k
    12k groceries at Ebeano yesterday

Tap the mic to dictate — real speech recognition, run by the browser, no key
and no cost. Tap the plus for a camera shot or to upload screenshots, PDFs,
statements or spreadsheets. Files always wait for Claude; the app can't read
them itself.

## Getting Claude to sort things out

In a Claude Code session pointed at this folder:

    /budget

It reads anything pending, files it, and fixes rows the app was unsure about.
The full procedure is in `.claude/skills/budget/SKILL.md`.

## Where things live

| Path | What |
| --- | --- |
| Supabase `expenses` | Everything you've spent |
| Supabase `messages` | The chat thread, including anything waiting on Claude |
| Supabase `budgets` | Income and monthly caps per category |
| Supabase `categories` | Categories, icons, and the words used to guess them |
| `data/config.json` | Settings: wordmark, owner, active month, FX rates |
| `data/seed/` | The original JSON. Not live; rebuilds the DB with `npm run seed` |
| `scripts/db.mjs` | The CLI Claude uses to read and write it all |
| `lib/parse.ts` | Turns a typed line into an expense. No model involved. |
| `lib/store.ts` | **All writes.** Supabase, server-side only. |
| `app/api/upload/` | File uploads. A route handler, not a Server Action, which caps bodies at 1MB. |

## Security

Every table has RLS on with **no policies**, so the publishable key can read
nothing at all. The browser never talks to Supabase; it talks to this app, and
this app uses the secret key server-side. Attachments sit in a private bucket
and are streamed back through `/api/file`, never handed out as public links.

Two Supabase keys, because they are not interchangeable on this project:
PostgREST takes the new `sb_secret_` key, Storage still wants the legacy
`service_role` JWT. Both live in `.env.local`, which is gitignored. See
`.env.example`.

## Deploying to Vercel

Set these in **Project Settings -> Environment Variables** before the first
deploy. The app refuses to serve in production without a passcode, so a
misconfigured deploy fails closed rather than exposing your money.

| Variable | What |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | `sb_secret_...`, server-side only |
| `SUPABASE_SERVICE_ROLE_JWT` | legacy `service_role` JWT, for Storage |
| `BIBLO_PASSCODE` | what you type to get in |
| `BIBLO_SESSION_SECRET` | any long random string; changing it signs out every device |
| `CRON_SECRET` | any long random string; Vercel sends it to the keep-alive route |

`vercel.json` schedules `/api/cron/keepalive` daily at 06:00 UTC, which stops
the free Supabase project pausing after 7 idle days.

## Not done yet

- **The worker**: polls Supabase for pending messages, runs `claude -p` to
  process each, writes the reply back into the thread. Your laptop has to be
  on for it. Ordinary typed entries don't depend on it — the app parses those
  itself — so only receipts and odd phrasing wait.


## Sample data

August 2026 is made up, kept so the charts have something in them. Every row
is marked `entry.how: "sample"`. Ask Claude to remove the sample rows to clear
it.
