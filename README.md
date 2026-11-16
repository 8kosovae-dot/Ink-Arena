# Ink Arena v3 — Groq-powered writing battles

This package upgrades an existing Ink Arena v2 GitHub Pages + Supabase project to v3 group matches with a server-side Groq judging function.

**Start here:** Read `START-HERE-FROM-V2.md` (also copied as `SETUP-GUIDE.md`). It assumes the v2 app and v2 Supabase schema are already installed, and provides the complete v2-to-v3 sequence.

## Main files

- `index.html`, `style.css`, `app.js`, `config.js`: browser website files. Put these four files at the root of the existing GitHub Pages repository.
- `database/setup-v3.sql`: one-time database migration from v2 to v3.
- `database/moderator-role.sql`: optional role assignment for the adult moderator after that account has registered.
- `supabase/functions/judge-match/index.ts`: Groq-backed judging Edge Function. Deploy it with the Supabase CLI.
- `supabase/config.toml`: Edge Function settings.

## Security

`config.js` contains only the Supabase Project URL and Publishable/anon key. The Groq API key must be stored in Supabase Edge Function Secrets and must never be placed in browser files or GitHub.

## Important account requirement

Groq's current Services Agreement requires the account user to be at least 18. A parent/guardian who is 18 or older must own and administer the Groq account and API key, review the terms and data practices, and handle billing. Do not access an adult's account or credentials. The adult should confirm the service is suitable for the app's intended users before enabling it.

## Beta limitation

The default safety model is currently Preview. Screening can make mistakes and is not a complete safety solution. Keep Ink Arena private, use adult moderation, and do not treat this as ready for public launch.
