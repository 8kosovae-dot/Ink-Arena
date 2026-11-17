# Ink Arena v3.6

Ink Arena is a competitive writing platform with public matchmaking, private invite-code rooms, AI judging, ELO rankings, saved stories, and a public Gallery.

## v3.6 additions

- Private rooms for 2–30 writers. A regular registered player hosts and shares an eight-character code.
- Registered players and temporary anonymous guests can join by entering the code.
- Any guest in a match makes that match unranked, so no participant gains or loses ELO or match-record points.
- Public matchmaking stays separate and supports 2–8 writers.
- Google sign-in has been removed; email/password and guest access remain.
- AI judging now accepts up to 30 entries per room.

## Project files

- `index.html`, `style.css`, `app.js`: GitHub Pages website.
- `config.js`: Supabase Project URL and browser-safe Publishable key only. Keep your existing configured file.
- `database/upgrade-v3.6-private-rooms.sql`: migration for an existing v3.5 database.
- `supabase/functions/judge-match/index.ts`: Supabase Edge Function used for AI judging.
- `UPGRADE-V3.6.md`: installation, Google sign-in removal, room usage and test checklist.

## Update existing v3.5

1. Back up the website repository and Supabase project.
2. Run `database/upgrade-v3.6-private-rooms.sql` once in Supabase SQL Editor.
3. Replace the three website files in your GitHub Pages repository. Keep `config.js` unchanged.
4. Deploy the updated `judge-match` Edge Function.
5. Hard-refresh the published site.

Never put Supabase secret/service-role keys or AI-provider API keys in browser files or GitHub.
