# Ink Arena v3.6 — Private rooms with invite codes

This update is for an existing v3.5 installation. It removes Google sign-in from the website and adds private invite-code rooms for 2–30 writers. Public matchmaking remains 2–8 writers. Regular registered accounts can host; registered accounts and temporary anonymous guests can join with a code. If any guest joins a match—even if they later leave—the whole match remains unranked and no player's ELO or win/loss/draw record changes.

## Install

1. Back up your current GitHub repository and Supabase project.
2. In Supabase, open **SQL Editor → New query** and run `database/upgrade-v3.6-private-rooms.sql` once. Do not rerun the original v3 setup SQL or earlier migrations.
3. Replace `index.html`, `style.css`, and `app.js` in the GitHub Pages repository with the v3.6 files. Keep `config.js` unchanged.
4. Replace/deploy the existing Supabase Edge Function `judge-match` using `supabase/functions/judge-match/index.ts` from this package. This raises judging support from 8 to 30 entries and keeps feedback concise for larger rooms.
5. Commit to `main` and hard-refresh with Ctrl+F5.

## How private rooms work

- A registered (non-guest) account chooses a room size between 2 and 30 and selects a time mode in the Arena.
- The app creates an eight-character hexadecimal invite code. Share it with the group.
- Participants first sign in normally or choose **Continue as guest**, then enter the code. Guests do not need an email address or account profile.
- The match starts automatically when the selected room size is reached. The timer starts at that moment.
- A waiting host can close the room. If the host closes it, all waiting members are removed and the room is cancelled.
- Public matchmaking remains a separate queue for 2–8 writers. Public queue searches exclude private rooms.

## Google sign-in removal

The Google OAuth button and client-side Google OAuth call have been removed. This update does not alter your Google provider settings inside Supabase; you can disable Google under **Authentication → Sign In / Providers** if it was previously enabled. Email/password and anonymous guest sign-in remain. No Google secrets are needed in the site.

## Test checklist

1. Log in with a regular account and host a room with 2 players.
2. Copy the code and join it from a second browser session as a guest.
3. Confirm the timer starts when the room fills, and the match is marked unranked after judging.
4. Repeat using a 30-player room configuration (you can inspect the lobby as participants join); confirm the room refuses a 31st player.
5. Confirm public matchmaking still only pairs people with matching settings and never joins a private room.
6. Confirm that a host leaving a waiting room closes it, and that a non-host leaving does not close the room.

The code and client scripts pass static checks in this package, but the SQL migration and live 30-writer AI judging must be tested in your own Supabase project. Groq model context, rate limits, output tokens and your configured per-day AI cap may limit the practical number of large-room judgements.
