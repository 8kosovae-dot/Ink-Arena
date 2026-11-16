# Ink Arena Multiplayer Beta (v2)

This version upgrades the static mockup into a real, unranked two-player online writing match using Supabase. GitHub Pages still hosts the static site.

## Files
- `index.html` — page layout
- `style.css` — design
- `config.js` — your Supabase Project URL and Publishable key
- `app.js` — login, matchmaking, shared timer, submissions, results
- `supabase-setup.sql` — database tables, row-level security, and safe RPC functions

## Part A — Create a Supabase project
1. Open https://supabase.com/dashboard and create a project. You may need an adult's help with account setup or any payment settings. Start with the Free plan; no paid plan is required for this prototype.
2. Open the project's SQL Editor, choose a new query, paste all of `supabase-setup.sql`, and run it.
3. Open Project Settings / API Keys (or the project's Connect dialog). Copy the **Project URL** and **Publishable key**.
4. Open `config.js` and replace the two `PASTE_...` values with those values. Keep the key type as Publishable. Never use a `service_role` or secret key in `config.js`.
5. Save the file.

## Part B — Publish to GitHub Pages
1. In your `ink-arena` repository, upload/replace `index.html`, `style.css`, `app.js`, and `config.js` in the repository root.
2. Upload `supabase-setup.sql` too if you want to keep the setup script with the project; the browser does not load it.
3. Commit the files and wait for GitHub Pages to deploy.
4. Refresh the site. Create two test accounts with different email addresses and usernames, ideally on two devices or in two different browser profiles.
5. Sign in on both. Click **Find a writing battle** on each. The first user waits; the second should pair with them and start the same prompt/deadline.

## What works
- Supabase email/password accounts
- Public usernames (email addresses are not shown)
- Queue pairing between two real signed-in players
- One shared prompt and a server-generated 10-minute deadline
- 400-word maximum, checked in the browser and database
- Server-side submission storage
- Automatic reveal after both players submit
- Match state can be resumed after refreshing the page

## Current limitations
- Matches are unranked scrimmages. No AI scores or ELO changes are applied yet.
- A match can time out if a player closes the browser or does not submit.
- Queue is global, not region-filtered and not skill-based.
- This beta is intended for testing with people you know. Before opening it publicly, add reporting, content moderation, abuse prevention, rate limits, privacy information, account deletion, and stronger match lifecycle handling.
- The browser uses Supabase's public Publishable key. This is expected only because Row Level Security is enabled and all writes go through restricted database functions. Never expose a Supabase secret/service_role key or an AI provider key in browser code.

## Troubleshooting
- `Invalid API key` / setup needed: check the URL and Publishable key in `config.js`.
- `permission denied`: rerun the SQL script and confirm the user is signed in.
- Account created but cannot log in: confirm the email using the link Supabase sent.
- Waiting forever: a second account must also click Find a writing battle. Make sure both use the same deployed site and Supabase project.
- `relation does not exist`: the SQL script did not complete successfully; check Supabase SQL Editor output.

## Safety and privacy before inviting people
Use usernames, not real names. Never display login emails. Keep direct messages off at first. Provide a way to report inappropriate content and remove abusive accounts before making matches public. Only share stories you are comfortable showing to your opponent.
