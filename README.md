# Ink Arena v3.6.3

This release refines the Private Rooms panel and fixes the private-room creation SQL mismatch.

## Update an existing v3.6.2 project

1. Back up the repository and database.
2. Run `database/fix-private-room-create-v3.6.3.sql` in Supabase SQL Editor.
3. Replace `index.html`, `style.css`, and `app.js` in the GitHub Pages repository.
4. Keep your existing `config.js` unchanged.
5. Hard-refresh the website after GitHub Pages deploys.

See `UPGRADE-V3.6.3.md` for details. The SQL patch assumes the v3.6 private-room migration is already installed.

## Existing app setup

The project uses static HTML/CSS/JavaScript, Supabase Auth and Database, and the existing server-side judging function. No build step is required for GitHub Pages.
