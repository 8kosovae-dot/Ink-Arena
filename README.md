# Ink Arena v3.4

Ink Arena is a multiplayer writing arena built with GitHub Pages and Supabase. This release extends v3.3 with Lightning and 30-minute games, automatic deadline submissions, six-part 120-point judging, and a more scalable story library, Gallery, and Rankings page.

## Main files

- `index.html`, `style.css`, `app.js`: GitHub Pages frontend.
- `config.js`: browser-safe Supabase project URL and Publishable key. Preserve your existing values; never put service-role or AI-provider secrets here.
- `database/upgrade-v3.4.sql`: in-place update for an existing v3.3 + guest-mode database.
- `supabase/functions/judge-match/index.ts`: server-side AI judging function; deploy it to the existing Supabase Edge Function.

## Upgrade

Read `UPGRADE-V3.4.md` before installation. The v3.4 SQL migration is for an existing v3.3 database with guest mode enabled. It is not a replacement for the original v2-to-v3 setup script.

## Game modes

- Lightning: 1 minute / 500 characters
- 5 minutes / 2,500 characters
- 10 minutes / 5,000 characters
- 15 minutes / 7,500 characters
- 20 minutes / 10,000 characters
- 30 minutes / 10,000 characters

The character cap is calculated from match time and remains capped at 10,000 characters.

## Scoring

Six categories are worth 20 points each: Craft & clarity, Story & structure, Prompt fit, Emotion & impact, Originality, and Spelling & grammar. New matches are scored out of 120. Historical 100-point results retain their original display scale.

Any match that includes a guest is unranked for every participant. Guests do not appear in Rankings, and no player in a guest match gains or loses ELO or win/loss/draw record points.
