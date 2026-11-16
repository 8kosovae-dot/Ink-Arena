# Ink Arena v3.1 — multi-page build

This release adds separate Home, Arena, Rankings and Profile pages, moves match-size/time/character controls into Arena, fixes the PL/pgSQL `deadline_at` ambiguity in matchmaking, and expands the prompt library. Horror is now a plain `Horror` category with atmospheric suspense prompts.

## Files
- `index.html`, `style.css`, `app.js`, `config.js`: GitHub Pages frontend.
- `database/fix-matchmaking-and-prompts.sql`: run this now if v3 was already installed; it fixes the matchmaking function and adds prompts.
- `database/setup-v3.sql`: full v3 database setup for upgrading from v2.
- `supabase/functions/judge-match/index.ts`: server-side Groq judge.

## Upgrade when v3 is already installed
1. Back up the Supabase project.
2. Run `database/fix-matchmaking-and-prompts.sql` in Supabase SQL Editor.
3. Replace the four frontend files in the GitHub Pages repository. Keep your existing `config.js` credentials (URL and Publishable key only).
4. Hard refresh the website.

Do not rerun the full v3 setup unless you are still upgrading from v2. Never put a Groq key or Supabase secret/service-role key in GitHub.
