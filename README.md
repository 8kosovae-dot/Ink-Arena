# Ink Arena v3.6.4

This update adds a visible Leave game button to the live writing editor, polishes the aligned Create/Join Private Rooms panels, replaces the capacity box with a small **Player cap: 30** note, and removes the site's five-judgments-per-day AI quota.

## Update an existing v3.6.x project

1. Back up your GitHub repository and Supabase project.
2. Run `database/remove-daily-ai-limit-v3.6.4.sql` in Supabase SQL Editor.
3. Replace `index.html`, `style.css`, and `app.js` in your GitHub Pages repository.
4. Deploy the updated Edge Function from `supabase/functions/judge-match` (for example, run `supabase functions deploy judge-match` from the project root).
5. Keep your existing `config.js` and Supabase/Groq secrets unchanged.
6. Hard-refresh the website after GitHub Pages finishes deploying.

The site no longer applies a daily AI judging quota. The AI provider may still enforce its own rate limits, quotas, and billing limits. A four-attempt retry guard remains for each individual match.

## Project setup

The frontend is static HTML/CSS/JavaScript and works with GitHub Pages. Supabase Auth, the database, and the `judge-match` Edge Function provide multiplayer and AI judging. Never place Supabase service-role or AI-provider secret keys in browser files.
