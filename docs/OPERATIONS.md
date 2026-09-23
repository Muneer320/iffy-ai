# Running and maintaining the notebook

The supported application is `frontend/` plus `backend/`. `frontend_v2/` is a historical experiment. The default app is a **local teaching demo**, not an unrestricted model endpoint or a public community service.

## Docker demo

From the repository root, with Docker Desktop running:

```sh
docker compose -p iffy-demo up -d --build --wait
```

Open **http://localhost:5175**. The API is at http://localhost:8102/api/health. Both published ports bind to loopback. Compose explicitly selects demo mode and passes no provider credentials. Initial image/dependency downloads require internet; the built demo, system fonts and authored examples do not need a model, database service or external assets.

The demo has three exact prompts, one authored branch per original, sector explanations and three fictional debate voices per example. Other questions, arbitrary branches and debate follow-ups return a clear refusal. Scores, causal connections and personas are authored illustrations; they are not forecasts, real interviews or empirical measurements.

All notebooks and branches are saved in the `iffy-demo_notebooks` Docker volume. Ordinary stop/recreation retains them:

```sh
docker compose -p iffy-demo stop
docker compose -p iffy-demo up -d --wait
```

Export a notebook from the UI as JSON. To back up the entire local file:

```sh
docker compose -p iffy-demo cp api:/app/.local-data/notebooks.json ./notebooks-backup.json
```

That file may contain your questions in live-derived exports; keep backups private. Removing the named volume destroys the demo's saved notebooks. The local file store is for one Node process, has a 250-notebook cap, and serializes writes with atomic file replacement. It is not a distributed database. If its file is damaged, preserve it before diagnosing or restoring a backup. Browser pins are optional local preferences; clearing browser storage removes pins, not server notebooks.

## Native development

Node.js **22.12 or newer**; Node 24 is used in Docker and CI. Run these in two terminals:

```sh
cd backend
npm ci
npm run dev
```

```sh
cd frontend
npm ci
npm run dev
```

No `.env` file is required for the default demo. Backend: 127.0.0.1:8102; frontend: 127.0.0.1:5175. Use `localhost:5175` in the browser to match the example CORS origin. Native demo notebooks live in `backend/.local-data/`; that folder is ignored. Docker and native development have separate data stores.

The frontend rewrites `/api/*` to `IFFY_BACKEND_URL`. It is a server-side setting read when the frontend builds. The default is `http://127.0.0.1:8102`; the Docker build uses `http://api:3000`. Set the correct backend URL **before** rebuilding a separately hosted frontend. Never put a provider key or workspace passkey in a `NEXT_PUBLIC_*` variable.

## Optional private live mode

Live mode sends prompts to **Groq** and stores simulations/conversations in **Supabase**. It is one private operator workspace, not a multi-user service. Anyone holding its passkey can access every notebook. Do not use it to store sensitive personal information or publish its passkey in a public frontend.

1. Provision your own Supabase project. Apply `backend/lib/supabase/migrations/001_initial.sql`, then **002_private_workspace.sql**. The second migration removes the original anonymous read policies and adds the shared generation budget.
2. Copy `backend/.env.local.example` to `backend/.env.local`. Select `IFFY_MODE=live` and set server-only `GROQ_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and a random `IFFY_API_TOKEN` of at least 32 characters. Despite its historical name, the Supabase URL is used only by the server; no browser Supabase client is used.
3. Set `CORS_ORIGIN` to your exact frontend origin, including scheme and port. Wildcard `*` is rejected. Start/restart the backend; build the frontend with the matching private backend URL.
4. Open the UI's **Workspace access** form and enter the passkey. It is held in memory for this visit and forwarded as an Authorization header; it is never saved in browser storage or exports. Use HTTPS when hosting remotely.

The normal demo Compose file deliberately remains demo-only. For live hosting, configure a separate environment rather than adding provider secrets to tracked Compose files.

### Budgets and failure behavior

- Every actual model request, including retries and schema repairs, consumes a PostgreSQL-backed shared quota: **6 attempts per UTC minute, 50 per UTC day** for the workspace. These count attempts, not user actions or tokens; one exploration can consume several attempts.
- The function checks and increments both buckets under one transaction lock. It is executable only by `service_role`. Missing migration/database availability returns 503 before any model call; exhaustion returns 429.
- SDK automatic retries are disabled. `AI_MAX_RETRIES` accepts 0–2, default 1. Generation retries and repair attempts are bounded; each consumes quota. Provider 429 and shared-budget failures are not retried. Provider timeout is 20 seconds per attempt; database network timeout is 10 seconds.
- JSON requests are limited to 128 KiB, scenarios to 1,200 characters, branches/follow-ups to 600 characters, graphs to 80 nodes/160 edges and request conversation history to 36 messages. Schema and relationship checks validate structure, not the truth of a causal claim.
- Live routes require the passkey before parsing/generating; CORS alone is not authentication. The frontend does not inject a secret for anonymous visitors. A failed database save fails the request instead of claiming the notebook was saved.
- Demo POSTs have a per-process 60/minute limit. That is local resource protection, not the distributed paid-generation quota.

Real Groq/Supabase credentials, provider generation and an upgraded Vercel deployment have **not** been verified by the local demo checks. The code tests exercise real SDK request/response handling with simulated transport, and the quota/RLS migration is checked against actual PostgreSQL. Existing external endpoints do not gain these protections until redeployed with the new configuration and migration; review or disable old deployments independently.

## Checks

```sh
cd backend
npm test
npm run build
npm run typecheck
npm audit --omit=dev
```

From the root, with Docker available:

```sh
python backend/tests/check-budget.py
docker compose -p iffy-demo up -d --build --wait
python backend/tests/smoke-demo.py
```

The migration check creates an isolated synthetic PostgreSQL container, tests concurrent budgets and permissions, then removes only that container. It does not connect to your Supabase project. The HTTP smoke script refuses non-loopback or non-demo targets.

```sh
cd frontend
npm ci
npm run lint
npm run build
npm run typecheck
npx playwright install chromium
npx playwright test
```

For a local Chrome installation, set `IFFY_CHROME_PATH` to its executable instead of downloading Chromium. CI uses Chromium. Browser checks cover the real local API, branches, comparisons, sectors, perspectives, export, reload/pin persistence, mobile overflow and recoverable errors. Tests and screenshots use only the authored examples.
