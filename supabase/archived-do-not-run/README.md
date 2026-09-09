# DO NOT RUN — archived, not migrations

These two files were sitting inside `supabase/migrations/` looking like normal
migrations, but they are not part of AdSpotX's schema at all:

- `adspot-rls.sql`
- `fix-owner-rls-and-confirm.sql`

They predate the `adspot_`-prefixed table design and operate on the
**unprefixed** `public.profiles`, `public.brands`, `public.handle_new_user()`,
and the `on_auth_user_created` trigger. AdSpotX shares its Supabase project
(`ukhdjvbzbidxoieauhpr`) with MyYangaX, and those exact unprefixed names
belong to MyYangaX's own schema on that same project — see the warning at the
top of `supabase/migrations/20260829_auth_smooth_trigger_rls.sql`:

> "MUST NOT replace" [the unprefixed trigger/tables — they belong to another app]

Nothing in this repo's build (`scripts/apply-adspot-sql.mjs`) ever executes
these two files, and they are moved out of `supabase/migrations/` specifically
so no future "apply everything in this folder" script or tool ever picks them
up by accident. If either file's logic is still needed, it should be rewritten
against the `adspot_`-prefixed tables/functions and reviewed before it goes
anywhere near `supabase/migrations/` again.
