# Rankacy Public API Showcase

Small FastAPI application that demonstrates the happy-path flow for Rankacy highlights from Python:

- upload a `.dem` file
- monitor demo processing (`NEW`, `PROCESSING`, `SUCCESS`, `FAILED`)
- inspect parsed players and kills
- list render options and estimate cost
- create highlights automatically, by ticks, or by kill ID
- monitor highlight processing and view webhook deliveries

The repository is meant to read like a clean integration example for developers evaluating Rankacy's public API.

## What is included

- `app/client.py`: typed `httpx` client for `/api/public/v1`
- `app/services.py`: small orchestration layer for dashboard and demo workspace loading
- `app/main.py`: FastAPI routes, local Swagger UI, webhook receiver
- `app/static/`: lightweight UI with manual refresh controls and raw JSON views
- `app/webhook_store.py`: file-backed webhook event log with deduplication by event ID
- `tests/`: small unit tests for env loading and webhook storage

## Requirements

- Python 3.13+
- Rankacy API token

## Configuration

Copy `.env.example` to `.env` and set your token:

```bash
cp .env.example .env
```

Required variables:

- `RANKACY_BASE_URL=https://highlights-api.rankacy.com`
- `RANKACY_TOKEN=<your token>`

Optional variables:

- `RANKACY_REQUEST_TIMEOUT_SECONDS=30`
- `RANKACY_UPLOAD_TIMEOUT_SECONDS=180`

The app will start without `RANKACY_TOKEN`, but live public API proxy routes will return a clear `503` configuration error until the token is set.

`RANKACY_UPLOAD_TIMEOUT_SECONDS` is intentionally higher because `.dem` uploads can take longer than ordinary metadata requests. If an upload times out locally, refresh the demos list before retrying because the upstream API may already have accepted the file.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
uvicorn app.main:app --reload --port 9000
```

Then open:

- UI: [http://localhost:9000](http://localhost:9000)
- Local Swagger: [http://localhost:9000/docs](http://localhost:9000/docs)

The UI is split into focused subpages:

- `/`: overview and upload entry point
- `/demos`: demo processing, players, kills, and highlight request creation
- `/highlights`: render options, cost checks, and highlight monitoring
- `/webhooks`: webhook receiver notes and local event log

Overview now also includes the route map, external docs links, happy-path checklist, health, and credit/transaction information.

## Happy-path demo flow

1. Pick a `.dem` file in the UI and upload it.
2. Optionally enable auto highlight at upload time. The current resolution/FPS profile is sent with the upload.
3. Watch the selected demo until it reaches `SUCCESS`.
4. Inspect players and kills for that demo.
5. Queue highlights from the Demos page with one of the three creation flows.
6. Watch highlight status update in the UI or Swagger.

The UI uses explicit refresh actions so you control when async status is reloaded.

## Integration endpoints exposed by this app

The UI now calls the same public-path proxy routes exposed in local Swagger:

- `POST /api/public/v1/demos/upload`
- `GET /api/public/v1/demos`
- `GET /api/public/v1/demos/{demo_id}`
- `GET /api/public/v1/demos/{demo_id}/kills`
- `GET /api/public/v1/demos/{demo_id}/players`
- `GET /api/public/v1/highlights`
- `GET /api/public/v1/highlights/{highlight_id}`
- `DELETE /api/public/v1/highlights/{highlight_id}`
- `GET /api/public/v1/highlights/resolutions`
- `GET /api/public/v1/highlights/fps`
- `GET /api/public/v1/highlights/cost`
- `POST /api/public/v1/highlights`
- `POST /api/public/v1/highlights/by-ticks`
- `POST /api/public/v1/highlights/by-kill`
- `GET /api/public/v1/me/credit`
- `GET /api/public/v1/me/transactions`
- `GET /showcase/health`
- `GET /showcase/webhook-events`
- `POST /webhooks/rankacy`

## Webhooks

The app includes an optional receiver at `POST /webhooks/rankacy`.

- Incoming events are stored in `data/webhook-events.json`
- Deduplication uses `X-Event-Id`, with JSON body `id` as fallback
- The handler returns quickly and keeps the payload for local inspection

For local testing with Rankacy, expose the app with a tunnel such as `ngrok http 9000` and point Rankacy's webhook URL to:

```text
https://<your-subdomain>.ngrok.io/webhooks/rankacy
```

## Docker

Build and run:

```bash
docker compose up --build
```

`docker-compose.yml` expects a local `.env` file and persists webhook logs through the mounted `./data` directory.

## Verification

Run the unit tests:

```bash
python3 -m unittest discover -s tests
```

## Notes for external developers

- Secrets are not stored in source control. `.env` is ignored.
- Upstream `401 Unauthorized`, `403 Forbidden`, `404`, and `422` responses are preserved with developer-friendly JSON error payloads.
- The UI intentionally shows raw API objects so you can inspect IDs, statuses, pagination fields, and validation errors.
- This project keeps runtime state local and simple. For production, replace file-backed webhook storage with a durable store.

## Rankacy references

- Swagger UI: [https://highlights-api.rankacy.com/docs](https://highlights-api.rankacy.com/docs)
- Documentation: [https://highlights-api.rankacy.com/ui/docs/](https://highlights-api.rankacy.com/ui/docs/)
