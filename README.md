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


## Guest mode (v3.2)

The updated website includes **Continue as guest**. Guests use Supabase Anonymous Sign-Ins, can join writing rooms and receive AI writing scores, but do not receive ELO and do not appear in the leaderboard. If any participant in a room is a guest, that entire room is unranked: no participant's ELO, wins, losses, or draws change. Guest identities are temporary and cannot be recovered after sign-out or clearing browser data.

For an existing v3.1 database, run `database/enable-guest-mode.sql` once in Supabase SQL Editor, then enable **Anonymous Sign-Ins** under Authentication settings. Replace the website files with the updated `index.html`, `style.css`, and `app.js`; keep `config.js` unchanged. For a new v2-to-v3 install, the updated `database/setup-v3.sql` already includes guest support.


## v3.3 update

- Arena matchmaking now uses only player count and time. Character allowance is automatic: 5 minutes = 2,500 characters; 10 = 5,000; 15 = 7,500; 20 = 10,000.
- A prompt can be skipped only when every active player votes. The timer resets to the full match time, and voting closes after the first story submission.
- AI grading now includes spelling and grammar as one of five 20-point criteria.
- Results show the winner or a tie prominently.
- Registered players can privately save their own successfully judged stories and optionally publish them to the public Gallery. Other registered players can give a thumbs-up.
- The Gallery is readable without signing in. Guest accounts cannot save permanently, publish, or like stories.

### Upgrade an existing v3.2 database

Run `database/upgrade-v3.3.sql` once in Supabase SQL Editor. Then replace the site files from this ZIP in your GitHub Pages repository and deploy `supabase/functions/judge-match/index.ts` as the updated `judge-match` Edge Function. Keep `config.js` unchanged.


## v3.3 upgrade

See `UPGRADE-V3.3.md` for the in-place database, website, and judging-function upgrade steps.
