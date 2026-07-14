# Supabase persistence

Development defaults to `demo-memory`. Production refuses to start a persistence operation unless both server credentials are configured.

## Connect a project

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `PERSISTENCE_MODE=supabase`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
3. Link and apply the existing migrations:

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable.

## Verify

Start the app and inspect the schema health endpoint:

```sh
curl http://localhost:8083/api/health/persistence
npm run test:persistence
```

The health endpoint checks all tables required by migrations `0001` through `0011`. The smoke test writes a temporary project, reads it with a new Supabase client, and deletes it.
