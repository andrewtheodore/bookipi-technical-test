# Implementation Plan: High-Throughput Flash Sale System

## Overview

Build a flash sale backend (Node.js) + frontend (React) that handles thousands of concurrent purchase attempts for a single limited-stock product, enforcing one-item-per-user and preventing overselling.

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Backend | **Fastify** (TypeScript) | Fastest Node.js framework, built-in schema validation, better perf than Express under load |
| Frontend | **React** (TypeScript + Vite) | Required by spec, Vite for fast dev experience |
| Database | **PostgreSQL** (via Docker) | ACID transactions for inventory correctness |
| Cache/Lock | **Redis** (via Docker) | Atomic operations for rate limiting, distributed locking, and fast inventory checks |
| Message Queue | Not used | Considered but skipped — Redis pre-checks already provide sufficient backpressure. Documented as a production improvement for 10k+ req/s |
| Stress Testing | **k6** or **Artillery** | Industry-standard load testing tools for Node.js |
| Unit/Integration Testing | **Vitest** | Fast, TypeScript-native test runner |
| Containerization | **Docker Compose** | Run Postgres, Redis, backend, frontend all together |

---

## Architecture

```
                         +-------------------+
                         |   React Frontend  |
                         | (Vite + TypeScript)|
                         +---------+---------+
                                   |
                                   | HTTP REST
                                   v
                      +------------+------------+
                      |     Fastify API Server   |
                      |   (Stateless, scalable)  |
                      +--+-------+----------+---+
                         |       |          |
                    +----+  +----+----+ +---+------+
                    |       |         | |          |
                    v       v         v v          v
                 +-----+ +-------+ +-------+  +--------+
                 |Redis| |Redis  | |Redis  |  |Postgres|
                 |Cache| |Lock   | |Queue  |  |  (DB)  |
                 +-----+ +-------+ +-------+  +--------+
                                      |            ^
                                      v            |
                               +------+------+     |
                               | Queue Worker |----+
                               | (Purchase    |
                               |  Processor)  |
                               +--------------+
```

### Flow: Purchase Request

1. User clicks "Buy Now" -> API receives `POST /api/purchase`
2. **Pre-checks (Redis - fast path):**
   - Is flash sale active? (check sale config in Redis)
   - Is stock available? (check cached stock counter in Redis)
   - Has user already purchased? (check Redis set)
   - If any fail -> return immediately (no DB hit)
3. **Acquire distributed lock** (Redis lock on user ID to prevent double-submit)
4. **Enqueue purchase** into Redis Stream / BullMQ queue
5. **Worker processes purchase:**
   - BEGIN transaction in Postgres
   - `SELECT stock FROM products WHERE id = ? FOR UPDATE` (row-level lock)
   - Check stock > 0
   - Check no existing order for this user
   - INSERT order, UPDATE stock (decrement)
   - COMMIT
   - Update Redis cache (decrement stock counter, add user to purchased set)
6. Return result to user (via polling or direct response)

### Simplified Alternative (No Queue)

If we want to keep it simpler and still correct:
- Skip the queue, do the Postgres transaction directly in the API handler
- Use Redis only for fast pre-checks (cache layer) to reduce DB load
- This is simpler and still correct under concurrency thanks to `SELECT ... FOR UPDATE`
- **Recommended for this take-home to keep scope manageable**, while documenting the queue-based design as a production improvement

---

## Project Structure

```
bookipi-assignment/
  +-- docker-compose.yml          # Postgres + Redis + (optional) app containers
  +-- packages/
  |   +-- backend/
  |   |   +-- src/
  |   |   |   +-- index.ts             # Fastify app entry
  |   |   |   +-- config.ts            # Sale config (start/end time, stock)
  |   |   |   +-- routes/
  |   |   |   |   +-- sale.ts           # GET /api/sale/status
  |   |   |   |   +-- purchase.ts       # POST /api/purchase
  |   |   |   |   +-- order.ts          # GET /api/order/:userId
  |   |   |   +-- services/
  |   |   |   |   +-- sale.service.ts
  |   |   |   |   +-- purchase.service.ts
  |   |   |   +-- db/
  |   |   |   |   +-- client.ts         # Postgres client (pg or Prisma)
  |   |   |   |   +-- migrations/       # Schema migrations
  |   |   |   +-- redis/
  |   |   |   |   +-- client.ts         # Redis client
  |   |   |   +-- plugins/              # Fastify plugins (cors, etc.)
  |   |   +-- tests/
  |   |   |   +-- unit/
  |   |   |   +-- integration/
  |   |   +-- package.json
  |   |   +-- tsconfig.json
  |   +-- frontend/
  |   |   +-- src/
  |   |   |   +-- App.tsx
  |   |   |   +-- components/
  |   |   |   |   +-- SaleStatus.tsx
  |   |   |   |   +-- PurchaseForm.tsx
  |   |   |   |   +-- ResultMessage.tsx
  |   |   |   +-- hooks/
  |   |   |   |   +-- useSaleStatus.ts
  |   |   |   |   +-- usePurchase.ts
  |   |   +-- package.json
  +-- stress-test/
  |   +-- flash-sale.k6.js          # k6 load test script
  +-- README.md
  +-- PLAN.md
```

---

## Phase-by-Phase Implementation

### Phase 1: Project Setup & Infrastructure
- [ ] Initialize monorepo (npm workspaces or just two folders)
- [ ] Set up `docker-compose.yml` with Postgres and Redis
- [ ] Set up backend project: Fastify + TypeScript + Vitest
- [ ] Set up frontend project: React + Vite + TypeScript
- [ ] Create database schema (products table, orders table)
- [ ] Set up Redis and Postgres clients

### Phase 2: Core Backend - API Endpoints
- [ ] `GET /api/sale/status` - Returns sale state: `upcoming`, `active`, or `ended` (+ remaining stock)
- [ ] `POST /api/purchase` - Accepts `{ userId }`, attempts purchase
- [ ] `GET /api/order/:userId` - Check if user has a successful order
- [ ] Implement sale service (time-window checks)
- [ ] Implement purchase service with concurrency control:
  - Redis pre-checks (fast rejection)
  - Postgres `SELECT ... FOR UPDATE` for atomic stock decrement
  - Unique constraint on `(user_id)` in orders table to enforce one-per-user at DB level

### Phase 3: Concurrency & Robustness
- [ ] Redis cached stock counter (DECR atomic operation for fast stock check)
- [ ] Redis SET for tracking purchased users (SADD/SISMEMBER)
- [ ] Idempotency key support (prevent duplicate purchases from retries)
- [ ] Graceful error handling (stock exhausted, sale not active, already purchased)
- [ ] Rate limiting plugin (optional, nice-to-have)

### Phase 4: Frontend
- [ ] Sale status display component (with auto-refresh / polling)
- [ ] User ID input field
- [ ] "Buy Now" button with loading state
- [ ] Result feedback: success, already purchased, sold out, sale not active
- [ ] Simple, clean UI (TailwindCSS or plain CSS)

### Phase 5: Testing
- [ ] **Unit tests**: Sale service logic (time window checks), purchase validation
- [ ] **Integration tests**: Full API flow with real Postgres + Redis (via Docker)
  - Purchase succeeds during active sale
  - Purchase rejected outside sale window
  - Duplicate purchase by same user rejected
  - Purchase rejected when stock is zero
- [ ] **Stress tests** (k6 or Artillery):
  - Simulate 1000+ concurrent users hitting `POST /api/purchase`
  - Verify: total orders == min(total_stock, unique_users)
  - Verify: no overselling (orders <= stock)
  - Verify: no duplicate purchases per user
  - Report: response times, throughput, error rates

### Phase 6: Documentation & Diagram
- [ ] System architecture diagram (draw.io / Mermaid in README)
- [ ] README.md with:
  - Design choices and trade-offs
  - How to build and run (docker-compose up)
  - How to run tests
  - Stress test instructions and expected results
- [ ] Clean up code, final review

---

## Database Schema

```sql
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  stock       INTEGER NOT NULL CHECK (stock >= 0),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  user_id     VARCHAR(255) NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  created_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, product_id)  -- Enforces one-per-user at DB level
);

CREATE TABLE sale_config (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  start_time  TIMESTAMP NOT NULL,
  end_time    TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW()
);
```

---

## API Specification

### `GET /api/sale/status`
**Response:**
```json
{
  "status": "active",        // "upcoming" | "active" | "ended"
  "startsAt": "2026-05-07T10:00:00Z",
  "endsAt": "2026-05-07T11:00:00Z",
  "stockRemaining": 42
}
```

### `POST /api/purchase`
**Request:**
```json
{ "userId": "user123" }
```
**Response (success):**
```json
{ "success": true, "message": "Purchase successful!", "orderId": 1 }
```
**Response (failure):**
```json
{ "success": false, "reason": "already_purchased" }
// reasons: "already_purchased" | "sold_out" | "sale_not_active" | "invalid_request"
```

### `GET /api/order/:userId`
**Response:**
```json
{
  "hasPurchased": true,
  "order": { "id": 1, "productId": 1, "createdAt": "..." }
}
```

---

## Key Design Decisions & Trade-offs

| Decision | Rationale |
|----------|-----------|
| **Redis pre-checks before DB** | Reduces unnecessary DB load by 90%+ during a flash sale. Most requests will be rejected at Redis layer (sold out / already bought). |
| **Postgres `FOR UPDATE` row lock** | Ensures stock correctness under concurrency. Simple, proven, and doesn't require external coordination. |
| **Unique constraint on orders** | DB-level enforcement of one-per-user as a safety net, even if application logic has bugs. |
| **Stateless API server** | Can horizontally scale by adding more instances behind a load balancer. |
| **Direct processing (no queue)** | Simpler implementation for take-home scope. Queue-based design documented as production improvement for handling 10k+ req/s. |
| **Fastify over Express** | ~2-3x better throughput in benchmarks, schema validation built-in. |

---

## Estimated Effort by Phase

| Phase | Scope |
|-------|-------|
| Phase 1 | Setup & infra |
| Phase 2 | Core API endpoints |
| Phase 3 | Concurrency hardening |
| Phase 4 | React frontend |
| Phase 5 | Tests + stress tests |
| Phase 6 | Docs + diagram |

---

## Questions / Decisions to Make Before Starting

1. **ORM or raw SQL?** Prisma is convenient but adds overhead. Raw `pg` with parameterized queries is lighter and faster. Recommendation: **raw pg** for this project (performance matters).
2. **Monorepo tool?** npm workspaces is sufficient, no need for Turborepo/Nx for this scope.
3. **Stress test tool?** k6 (Go-based, very fast) vs Artillery (JS-based). Recommendation: **k6** for better concurrent user simulation.
4. **CSS approach?** TailwindCSS for quick, clean UI vs plain CSS. Either works.
