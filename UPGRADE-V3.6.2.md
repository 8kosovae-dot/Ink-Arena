# Ink Arena v3.6.2 — Private rooms polish

This is a website update for the existing v3.6 project.

## Changes

- Removed the Invite Only badge from the Private Rooms heading.
- Kept Create a room and Join a room as equal, full-width side-by-side panels on desktop; they stack on narrow screens.
- Removed the host player-count selector. New private rooms have a fixed capacity of up to 30 writers.
- Added a host-only Start match button in the waiting room. The host can start once at least 2 players have joined, so a group does not need to wait for all 30 seats to fill.
- Fixed the private room code generator so it no longer depends on `gen_random_bytes`.

## Update the existing project

1. Back up your GitHub repository and Supabase project.
2. In Supabase SQL Editor, run `database/fix-private-room-host-start-v3.6.2.sql` once. This replaces the room-host function and adds the host start function.
3. Replace `index.html`, `style.css`, and `app.js` in your GitHub Pages repository with the files in this release. Keep your existing `config.js` unchanged.
4. Hard-refresh the website after GitHub Pages finishes deploying.

For a brand-new setup, the full `database/upgrade-v3.6-private-rooms.sql` migration in this release also includes these fixes. Do not rerun that full migration on an existing database; use the small v3.6.2 patch above.
