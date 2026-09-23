# iffy.ai API

The scenario engine behind [the consequence notebook](../README.md): typed graphs, independent branches, sector exploration and fictional debate perspectives. The default authored demo needs no credentials; private live mode retains the Groq generation/validation/repair pipeline.

## Run locally

Use Node **22.12+**, with Node 24 used in Docker/CI.

```sh
cd backend
npm ci
npm run dev
```

Health: **http://localhost:8102/api/health**. Start `frontend/` separately and open localhost:5175, or use the root Docker quickstart. Native demo notebooks persist in ignored `.local-data/`. Demo mode refuses external Groq/Supabase client creation, even with inherited keys.

## API contract

Responses use `{ "success": true, "data": ... }` or `{ "success": false, "error": { "type": "...", "message": "..." } }`. JSON bodies are bounded to 128 KiB. Live routes require `Authorization: Bearer <workspace-passkey>`; only health/example metadata are public.

| Route | Request / result |
| --- | --- |
| `GET /api/health` | Runtime mode/storage type, no credential values. |
| `GET /api/examples` | Authored prompts, assumptions and supported branches. |
| `POST /api/simulate` | `{ "scenario": "What if a four-day workweek became the standard?", "duration_focus": "all" }`; saved simulation. |
| `GET /api/saved` | Actual saved summaries, newest first. |
| `GET /api/simulation/:id` | Full saved notebook, or 404. |
| `POST /api/mutate` | `{ "simulation_id": "<original UUID>", "mutation_prompt": "Public services receive funding to hire extra staff" }`; delta-compatible fields plus `simulation`, the independently saved branch. |
| `POST /api/sector` | `{ "simulation_id": "<UUID>", "sector": "Public services" }`; sector analysis. |
| `POST /api/debate` | `{ "simulation_id": "<UUID>" }`; fictional participants/opening messages. Live mode accepts bounded participants, history, follow-up and mode. |

`OPTIONS` supports GET/POST with an exact configured CORS origin. Historical community/feed/marketplace routes return 501, rather than pretending to provide social or commerce features.

From a second terminal on a POSIX shell:

```sh
curl -H "Content-Type: application/json" -d '{"scenario":"What if a four-day workweek became the standard?"}' http://localhost:8102/api/simulate
```

On Windows, use the root smoke command to avoid shell-specific JSON quoting:

```sh
python backend/tests/smoke-demo.py
```

The smoke script refuses non-loopback/non-demo targets and checks all examples, branches, sector/debate routes, concurrent saves and errors.

## Development desk

- [Operations, backup and live-mode setup](../docs/OPERATIONS.md)
- [Bounded request schemas](lib/requests.ts) and [simulation integrity schema](lib/schemas/simulation.schema.ts)
- [Access/body/CORS gate](lib/api.ts), [runtime selection](lib/runtime.ts) and [local/live storage](lib/storage.ts)
- [Authored examples](lib/demo/examples.ts) and [retained generation pipeline](lib/ai/pipeline/generate.ts)
- [Initial SQL](lib/supabase/migrations/001_initial.sql) and [private records/shared quota migration](lib/supabase/migrations/002_private_workspace.sql)
- `npm test`, `npm run build`, `npm run typecheck`, `npm audit --omit=dev`

Structural validation cannot establish factual or causal correctness. Offline tests do not verify real provider credentials or the old deployment. Team credits and MIT license remain at the repository root.
