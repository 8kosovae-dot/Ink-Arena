# Ink Arena v3 — Groq-powered writing battles

This package upgrades an existing Ink Arena v2 GitHub Pages + Supabase installation. It supports group rooms, 10,000-character maximum stories, account/settings features, and a server-side Groq judge.

## Start here

Read `START-HERE-FROM-V2.md`. It assumes you already have the v2 website and Supabase project. It explains the database upgrade, GitHub replacement, Groq secrets, and Edge Function deployment.

## Main files

- `index.html`, `style.css`, `app.js`, `config.js`: browser website files. Put these at the root of the existing GitHub Pages repository.
- `database/setup-v3.sql`: upgrade/migration for the existing v2 schema and the earlier moderator-enabled v3 draft.
- `supabase/functions/judge-match/index.ts`: Groq-backed AI safety screen and writing judge.
- `supabase/config.toml`: function JWT configuration.

## Character limit

The default match limit is 10,000 characters, not words. Players can choose 2,500, 5,000, 7,500, or 10,000 characters. The browser, database RPC, and submissions table enforce the selected cap and the 10,000-character hard maximum.

## Human moderation removed

There is no adult moderator account, moderator dashboard, manual report queue, or manual approval step in this version. Automated safety screening remains enabled. If the screen flags an entry, or the safety model fails or returns an invalid response, the entire match is automatically blocked: no entries are revealed to other players, no scores are issued, and no ratings change. This automated screen is imperfect; keep the platform private while testing.

## Security

`config.js` contains only the Supabase Project URL and Publishable/anon key. The Groq API key and Supabase service-role/secret key must remain in Supabase Edge Function Secrets. Never place them in GitHub or browser JavaScript.

## Important Groq account terms

Groq's current Services Agreement says Cloud Services are not for consumer use and that the account user must be 18 or older. A person under 18 must not create, access, or use a Groq Cloud account or another person's credentials. An adult must independently review the current terms and confirm whether this specific application and its intended users are permitted before enabling the integration. If not, leave AI judging disabled until a suitable provider arrangement is available.

## Node.js is not a hosting requirement

Node.js and the Supabase CLI are only tools used on your computer to deploy/update the Edge Function. After successful deployment, Supabase runs the function on its own hosted Edge network; your computer can be turned off. You do not run a Node server 24/7. You can alternatively create/deploy a function from the Supabase Dashboard without installing Node or the CLI.
