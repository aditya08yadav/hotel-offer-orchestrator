# Hotel Offer Orchestrator

Aggregates overlapping hotel offers from two mock suppliers, dedupes by hotel name, keeps the cheapest offer per hotel, caches the result in Redis and supports price-range filtering **inside Redis**. The whole flow is orchestrated by a **Temporal** workflow.

**Stack:** Node.js 20 (TypeScript), Express, Temporal, Redis, Docker Compose

## Architecture

```
Client ──GET /api/hotels?city=delhi&minPrice=&maxPrice=──▶ Express API
                                                             │ client.workflow.execute
                                                             ▼
                                                        Temporal Server
                                                             │ task queue "hotel-offers"
                                                             ▼
                                                        Temporal Worker
   hotelOfferWorkflow
     1. fetchSupplierHotels(A) ┐ parallel (Promise.allSettled)  ──▶ GET /supplierA/hotels
        fetchSupplierHotels(B) ┘                                 ──▶ GET /supplierB/hotels
     2. dedupe by name, keep cheapest   (pure function, deterministic)
     3. saveHotelsToRedis   (ZSET by price + HASH of JSON docs)
     4. queryHotelsFromRedis (ZRANGEBYSCORE min..max via Lua, one round trip)
```

Containers: `redis`, `temporal` (dev server + UI), `api` (Express + mock suppliers), `worker` (Temporal worker). `api` and `worker` share one image.

### Key design decisions
- **Parallel + resilient:** both suppliers are called in parallel. Each activity retries (3 attempts, exponential backoff, 3s HTTP timeout). If one supplier still fails, the request succeeds with the other supplier's data and the response carries an `X-Degraded-Suppliers` header. If both fail → `502`.
- **Dedupe rule:** names are matched case/whitespace-insensitively. Cheaper price wins; on an exact price tie the higher `commissionPct` wins (deterministic). Output is sorted by price ascending.
- **Redis price filtering:** per city, a sorted set `hotels:<city>:prices` (member = normalized name, score = price) and a hash `hotels:<city>:data` (JSON offers). The filter is a `ZRANGEBYSCORE` + `HMGET` in one Lua script, so no filtering happens in Node. Keys expire after `CACHE_TTL_SECONDS` (default 300).
- **Logging / errors:** structured JSON logs in the API, and `Context.current().log` / workflow `log` in Temporal (visible in worker output and the Temporal UI). Non-retryable failures (4xx, bad payload) skip retries; validation errors return `400`.

## Run it (Docker)

Requirements: Docker + Docker Compose.

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| Temporal UI | http://localhost:8233 |
| Redis | localhost:6379 |

First start can take a minute while the worker connects to Temporal (it retries automatically).

```bash
curl "http://localhost:3000/api/hotels?city=delhi"
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=5000&maxPrice=6000"
curl "http://localhost:3000/health"
```

Example response (`city=delhi`, truncated):

```json
[
  { "name": "Ibis Aerocity", "price": 4200, "supplier": "Supplier A", "commissionPct": 9 },
  { "name": "Lemon Tree",    "price": 5100, "supplier": "Supplier A", "commissionPct": 11 },
  { "name": "Holtin",        "price": 5340, "supplier": "Supplier B", "commissionPct": 20 },
  { "name": "Radison",       "price": 5900, "supplier": "Supplier A", "commissionPct": 13 }
]
```

Stop everything: `docker compose down`.

## API

| Method & path | Description |
|---|---|
| `GET /api/hotels?city=<city>` | Deduplicated best-price list |
| `GET /api/hotels?city=<city>&minPrice=<n>&maxPrice=<n>` | Same, filtered by price range in Redis (either bound optional, inclusive) |
| `GET /supplierA/hotels`, `GET /supplierB/hotels` | Mock suppliers (optional `?city=`) |
| `GET /health` | Health of Redis, Temporal, Supplier A and Supplier B |
| `POST /admin/suppliers/<A\|B>/<up\|down>` | Demo switch to simulate a supplier outage |

Status codes: `200` OK (empty array if nothing matches), `400` invalid/missing params, `502` both suppliers down, `500` unexpected.

`/health` returns `status: "ok"` (all up), `"degraded"` (a supplier is down but requests are still served, HTTP 200) or `"down"` (Redis/Temporal broken or both suppliers down, HTTP 503), plus per-component `status` and `latencyMs`.

### Simulate a supplier being down
```bash
curl -X POST localhost:3000/admin/suppliers/A/down
curl -i "localhost:3000/api/hotels?city=delhi"   # 200, header X-Degraded-Suppliers: Supplier A
curl localhost:3000/health                       # status: degraded
curl -X POST localhost:3000/admin/suppliers/A/up
```
Or start with `SUPPLIER_A_DOWN=true` / `SUPPLIER_B_DOWN=true`.

## Postman

Import `postman/hotel-offer-orchestrator.postman_collection.json`. It has a `baseUrl` variable (default `http://localhost:3000`) and test scripts covering: Delhi overlaps, price filters, a city with no results, validation errors, a supplier-down scenario (run that folder in order), and `/health`. Run the whole collection with the Collection Runner (or `newman run <file>`).

## Local development (without Docker for the app)

```bash
docker compose up -d redis temporal      # infra only
cp .env.example .env                      # then export the vars, or prefix commands with them
npm install
npm run dev:api        # terminal 1
npm run dev:worker     # terminal 2
npm test               # unit tests for dedupe logic
```

## Project layout

```
src/
  server.ts            Express app: /api/hotels, /health, error handling
  worker.ts            Temporal worker
  workflows/index.ts   hotelOfferWorkflow (orchestration)
  workflows/dedupe.ts  pure dedupe logic (+ dedupe.test.ts)
  activities/index.ts  fetchSupplierHotels, saveHotelsToRedis, queryHotelsFromRedis
  redis.ts             ZSET/HASH storage + Lua price filter
  suppliers/           mock supplier endpoints + data + outage switch
Dockerfile, docker-compose.yml
postman/               Postman collection
```

## Notes / trade-offs
- The Redis snapshot is per city and overwritten on every request, so two simultaneous requests for the same city with different price filters can briefly read each other's snapshot (the data is identical unless a supplier is degraded). A production version would key snapshots by a request/version id.
- Temporal runs in `start-dev` mode (SQLite) for easy local setup. For production, use `temporalio/auto-setup` with Postgres.
- `npm install` is used in the Dockerfile; commit a `package-lock.json` and switch to `npm ci` for reproducible builds.

## Deployment (any Docker host)
```bash
git clone <your-repo-url> && cd hotel-offer-orchestrator
docker compose up -d --build
docker compose logs -f api worker
```
