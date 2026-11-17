# Ink Arena v3.6.3 — Private room fix and copy cleanup

## Changes

- Removed the repeated “29 other writers” and “no room-size setup needed” copy.
- Changed the capacity label to the literal text **30 players**.
- Kept Create a room and Join a room as side-by-side panels on desktop, stacking on small screens.
- Made the Create private room action show visible progress and useful errors in the Private Rooms panel.
- Improved the sign-in/profile check before calling Supabase.
- Added a database patch that replaces the older `host_private_room` function. It uses PostgreSQL's built-in `gen_random_uuid()` instead of `gen_random_bytes()`.
- Preserved the 30-player room cap and host-only Start Match action (available once at least two players have joined).

## Update an existing v3.6.2 project

1. Back up your GitHub repository and Supabase project.
2. In Supabase, open **SQL Editor → New query**.
3. Run `database/fix-private-room-create-v3.6.3.sql` once. The verification query at the bottom should display the updated function definition. It should not contain `gen_random_bytes`.
4. Replace `index.html`, `style.css`, and `app.js` in your GitHub Pages repository with the files in this release.
5. Keep your existing `config.js` unchanged.
6. Wait for the GitHub Pages deployment to finish, then hard-refresh the site.

The SQL patch assumes the v3.6 private-room migration has already been applied. Do not rerun the original setup or full v3.6 migration on an existing project.

## Important

The code package cannot update your live Supabase database by itself. The SQL patch must be run in your own Supabase project. The SQL has been reviewed for consistency, but it has not been executed against your live database.
