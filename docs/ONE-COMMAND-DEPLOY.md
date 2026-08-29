# AdSpotX one-command deploy

```bash
pnpm ship          # build → git push main → Netlify build hook (if set)
pnpm secrets:deploy  # Netlify env from .env (needs NETLIFY_AUTH_TOKEN)
```

- SPA: Netlify (`netlify.toml` → `app/dist`)
- API + Postgres: Node host (`pnpm start` / Railway / App Runner) with `server/.env`
- AdSpot does **not** share MyYangaX Supabase edge functions; `DATABASE_URL` is separate Postgres (Supabase Postgres URL OK if its own project).

See `docs/ADSPOTX-DEPLOY-GUIDE.md` and `.env.example`.
