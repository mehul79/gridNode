# GridNode — Codebase Analysis

Generated 2026-09-05 · branch `main` @ 46fdecf · 91 commits

## 1. Identity

| Attribute | Value |
|---|---|
| Shape | Polyglot monorepo, 4 deployable components |
| Backend (`be/`) | Node 22 / TypeScript 5.9, Express 5, Prisma 6.19 → PostgreSQL, Better Auth 1.5 (Google OAuth), Socket.IO 4.8, BullMQ + ioredis, prom-client, Resend, AWS SDK v3 (S3) |
| Frontend (`fe/`) | Next.js 16.1.6 App Router, React 19.2, Tailwind v4, Radix/shadcn, socket.io-client, `output: "standalone"` |
| Agent (`agent/computeshare_agent/`) | Python ≥3.9, requests/psutil/GitPython/kaggle, PyInstaller-packaged, drives Docker CLI via `subprocess` |
| Infra (`infra/terraform/`) | Terraform ~>5.0 AWS, 6 local modules (network, storage, registry, database, iam, compute) + `bootstrap/` |
| Ops | GitHub Actions (CI + Deploy), ECR → EC2 via SSM, docker-compose, Prometheus + Grafana |
| Entry points | `be/src/index.ts` (:3005) · `fe/app/layout.tsx` (:3000) · `computeshare_agent.agent:main` |

## 2. Architecture

Classic layered structure inside the backend, mirrored per concern:

```
be/src/
  index.ts        Express app, metrics middleware, /metrics, CORS, Better Auth mount, Socket.IO, sweeper + email worker boot
  router/         single Router mounting 5 feature routers under /api
  routes/         auth · jobs · machines · approvals · agent   (all business logic lives here)
  middleware/     requireAuth · requireAgentAuth · requireRole
  lib/            db · auth · token · jobStatus · jobAccess · jobEvents · matchCriteria · sweeper · s3 · email
  queues/         BullMQ connection · email.queue · email.worker
  sockets/        Socket.IO server + emitLog/emitJobUpdate/emitMailUpdate helpers
```

Pattern: **layered / route-centric**. There is no service layer — routes talk to Prisma directly (`jobs.routes.ts` is 656 lines, the single largest file and the de-facto domain core). Cross-cutting policy is extracted into `lib/` helpers (`jobAccess`, `jobStatus`, `matchCriteria`), which is the codebase's strongest structural idea.

Two authentication planes, deliberately separated:
- **Browser** — Better Auth session cookie → `requireAuth` → `req.user`
- **Agent** — opaque 32-byte token, SHA-256 hashed at rest in `AgentSession.tokenHash` → `requireAgentAuth` → `req.agentSession` / `req.machine`

Scheduling is **pull-based**: the backend matches a machine at job-creation time (best-fit bin-packing on CPU/RAM waste, tie-broken by `trustScore`), and agents poll `GET /api/agent/jobs/next` to claim work.

## 3. Conventions

| Aspect | Observed |
|---|---|
| Files | `camelCase.ts` in `lib/`/`middleware/`, `*.routes.ts` for routers, `PascalCase.tsx` for React components, `kebab-case.tsx` for FE libs |
| Identifiers | `camelCase` functions/vars, `PascalCase` types/models, `SCREAMING_SNAKE` module constants |
| DB | Prisma models `PascalCase`, fields `camelCase`, snake_case enum members (`ml_notebook`, `pending_approval`), `@@index` on every FK, `cuid()` ids |
| API | REST under `/api`, plural nouns, verb sub-paths (`/stop`, `/approve`, `/heartbeat`), JSON `{ error: string }` on failure |
| Errors | Every handler is one `try { … } catch (err) { console.error(err); res.status(500).json({error}) }` — uniform, but no custom error types and no central error middleware |
| Types | Backend leans on `(req as any).user`; frontend has real interfaces in `fe/types/api.ts` |
| Migrations | 11 timestamped Prisma migrations, descriptive names |

## 4. Domain Model

11 Prisma models. Better Auth owns `User`/`Session`/`Account`/`Verification`; the domain is:

- **Machine** — `ownerId → User`, `hardwareId` (physical fingerprint, enables stable re-registration), `cpuTotal`/`memoryTotal`/`gpuTotal`/`gpuMemoryTotal`/`gpuVendor`, `status` (free-form string: idle/running/offline/reclaimed), `trustScore` (Float, 0–100, default 50), `totalJobsCompleted`/`totalJobsFailed`
- **Job** — `requesterId`, `providerId`, `machineId`, `decidedById`; `type` (ml_notebook|video_render|server_run|data_processing); requirements expressed as **tiers** (`CpuTier`, `MemoryTier`, `GpuMemoryTier`, `DurationTier`) rather than raw numbers; 11-state `JobStatus`
- **Approval** — 1:1 with Job, `pending|approved|rejected`, `decidedById`/`decidedAt`
- **JobEvent** — append-only audit log, `type` + JSON `payload` + `actorId`
- **JobLog** — `@@unique([jobId, sequence])` monotonic log lines
- **Artifact** — filename + S3 `storagePath` + mime/size
- **AgentSession** — `tokenHash` unique, `active|revoked`, `lastHeartbeatAt`

Lifecycle: `pending_approval → approved → queued → assigned → running → completed|failed`, with `preempted`/`cancelled` reachable from any non-terminal state.

## 5. Essential Floor

### Security — **partial**

| Check | Status | Evidence |
|---|---|---|
| Auth at boundaries | present | `requireAuth` / `requireAgentAuth` on every route except `POST /api/machines/register` (intentionally key-gated) |
| Object-level authorization | partial | `canViewJob`/`canStopJob` applied consistently in `jobs.routes.ts`; absent on Socket.IO and on `GET /api/machines?all=true` |
| Secrets from env | partial | `.env.example` present and `.env` gitignored, but the example ships a real-looking `BETTER_AUTH_SECRET` value |
| Input validation | partial | Hand-rolled enum/type checks in `POST /api/jobs` (thorough); no validation library anywhere; `POST /api/machines/register` trusts agent-supplied shapes |
| Token handling | present | `crypto.randomBytes(32)` + SHA-256 at rest; plaintext returned once |

### Testing — **absent (backend/frontend)**

- `be/package.json` → `"test": "echo \"Error: no test specified\" && exit 1"`. No Jest/Vitest. No `lint` script either.
- `fe/` has ESLint but no test framework.
- The only real tests are 8 pytest files under `agent/computeshare_agent/tests/` (incl. a `mock_backend.py` harness) — but there is no pytest config, pytest isn't in `requirements.txt`, and **CI never runs them**.
- `be/scripts/` holds ~11 ad-hoc verification scripts (`verify_reclaim_unit.ts`, `mock_test_sweeper.ts`, …) doing the job a test suite should — and `be/.gitignore` excludes `scripts`, so they aren't even versioned.

### Error Handling — **partial**

Uniform try/catch with correct-ish status codes (400/401/403/404/500) and 204 for "no work". But: no custom error classes anywhere in `be/src`, no Express error middleware, raw `console.error(err)` with no request context, and `jobStatus.canTransition()` — a complete state-machine guard — is **defined and never called**.

### Observability — **partial**

- Strong: `prom-client` default metrics + an `http_request_duration_seconds` histogram labelled by method/route/code, `/metrics` exposed, Prometheus scrape config + `alert_rules.yml`, provisioned Grafana dashboard and contact points, `awslogs` log driver in `docker-compose.yml`, container `HEALTHCHECK`s in both Dockerfiles.
- Missing: no structured logger (65 raw `console.*` calls in `be/src`), no request/correlation IDs, no log levels.
- No passwords or tokens in logs. One leak path: `emitMailUpdate` broadcasts `{ to: requesterEmail }` into an unauthenticated socket room (see S-2).

## 6. Strengths to Preserve

1. **Infrastructure and supply-chain posture is genuinely strong** — OIDC instead of static AWS keys, SSM instead of SSH, IMDSv2, RDS in private subnets, SHA-pinned GitHub Actions, Trivy on both images *and* IaC with `exit-code: 1`, tflint, Dependabot, multi-stage Dockerfiles on pinned digests, non-root users, `read_only` rootfs + `cap_drop: ALL` + `no-new-privileges` in compose.
2. **gVisor (`runsc`) sandboxing** for untrusted job containers, with the GPU exception explicitly reasoned about in `DECISIONS.md` and `docs/gvisor_boundaries.md`.
3. **`DECISIONS.md`** — 30+ real ADRs with alternatives and rationale. Rare and worth keeping current.
4. **Centralized access-control helpers** (`lib/jobAccess.ts`) rather than inline ownership checks scattered across handlers.
5. **Idempotent sweeper** — every mutation is a guarded `updateMany` with the expected status in the `where`, so concurrent sweeps and agent updates can't double-count.
6. **Agent tokens are never stored in plaintext.**

## 7. Findings

Severity reflects impact if the system runs beyond a trusted demo.

### Security

**S-1 · High — the "owner/admin" role gate does nothing, and nothing uses it.**
`be/src/middleware/requireRole.ts:6` `requireOwnerOrAdmin` looks the user up by id and calls `next()` if the row exists — it never reads a role, because `User` has no `role` field (the `user_roles_array` migrations were superseded by `new_start`). `hasRole` and `isOwnerOrAdminRole` are exported and referenced nowhere. Grep confirms zero imports of this module. Approvals happen to be safe because they check `job.providerId === user.id` directly, but the middleware is a live trap for the next route that adopts it.

**S-2 · High — Socket.IO is entirely unauthenticated.**
`be/src/sockets/index.ts:15` accepts any connection and `socket.on("join-job", jobId => socket.join(...))` with no session check and no `canViewJob`. Any client that can reach the server can join `job-<id>` for a guessed/known job id and receive live stdout/stderr (`emitLog`), status transitions, artifact registrations, and the requester's email address via `emitMailUpdate`. The REST layer's authorization is bypassed wholesale.

**S-3 · High — agents self-certify job outcomes and earn trust for it.**
`PATCH /api/jobs/:id/status` (`be/src/routes/jobs.routes.ts:~535`) accepts any `JobStatus` from the agent and, on `completed`, unconditionally does `trustScore + 2.0`. There is no transition validation (`canTransition` unused) and no verification of the work. A machine owner can loop approve→complete on their own submissions to reach `trustScore: 100`, which is exactly the gate `computeEffectiveRequirements` uses to hand out long-running jobs (`gt24h` requires ≥90).

**S-4 · High — re-queued jobs lose their provider binding.**
The same endpoint nulls `machineId` when an agent sets `status: queued`. `GET /api/agent/jobs/next` then matches on `{ machineId: null }` for *any* polling agent, without checking that the claiming machine's owner is the job's `providerId`. A job the requester's counterparty approved can be executed by a different, unapproved machine — the approval workflow's core guarantee.

**S-5 · Medium — any authenticated user can enumerate the whole fleet.**
`GET /api/machines?all=true` (`be/src/routes/machines.routes.ts:12`) drops the `ownerId` filter with no role or ownership check, returning every machine's owner id, hardware profile, `userKey`, and `trustScore`.

**S-6 · Medium — committed secret-shaped material.**
`be/.env.example:1` ships `BETTER_AUTH_SECRET="cLcv5EtcUcu4nlBGlwfuJ72fxwHkYemd"` — a concrete 32-char value, not a placeholder; anyone who copies the example inherits a public signing secret. `be/cookies.txt` is tracked in git; it's currently just a curl cookie-jar header, but it's the file curl writes live session cookies into.

**S-7 · Medium — production CORS/origins are hardcoded to localhost.**
`be/src/index.ts:52` allows only `http://localhost:3000` / `:8000`, and `be/src/lib/auth.ts:18` sets `trustedOrigins: ["http://localhost:3000"]`. The deploy pipeline ships these images to EC2, where no browser origin will match.

**S-8 · Low — Redis TLS certificate verification is disabled.**
`be/src/queues/connection.ts` sets `tls: { rejectUnauthorized: false }` for any `rediss://` URL.

### Correctness / CI

**C-1 · High — CI cannot pass on `main`.**
`.github/workflows/ci.yml` runs `npm run lint` in `./be` (no `lint` script exists → npm exits non-zero) and `npm test` in `./be` (which is literally `exit 1`). Both the `lint-and-typecheck` and `test` jobs fail on every pull request.

**C-2 · High — the deploy health gate can only fail.**
`.github/workflows/deploy.yml` polls `curl -sf http://localhost:3000/api/health` on the EC2 host. No `/api/health` route exists in the Next app (`fe/app` has no `route.ts` at all), and compose publishes the frontend on host port **80**, not 3000; the backend's health route is `/health` on 3005. Every deploy fails after a 3-minute poll.

**C-3 · Medium — the retry loop aborts on its first iteration.**
Same workflow: `((RETRY_COUNT++))` returns exit status 1 when `RETRY_COUNT` is 0, and GitHub runs `run:` blocks under `bash -e`. The loop dies immediately rather than retrying 18 times.

**C-4 · Medium — machine registration can 500 on real hardware.**
`be/src/routes/machines.routes.ts` derives `gpuVendor = gpu.name.split(' ')[0].toLowerCase() as GpuVendor`. A GPU named `"GeForce RTX 4090"` yields `"geforce"`, which is not in the `GpuVendor` enum → Prisma rejects the write. `agent.routes.ts` already has a correct `parseGpuVendor()` helper that substring-matches nvidia/amd/intel — it just isn't used here.

**C-5 · Low — dead safety code.**
`canTransition` (`lib/jobStatus.ts:30`) and all of `middleware/requireRole.ts` are unreferenced. Both encode policy the system currently doesn't enforce; either wire them up or delete them so the code stops implying a guarantee it doesn't provide.

### Documentation drift

**D-1 · Medium — `CLAUDE.md` describes a system that no longer exists.** It documents `User.role` (requester/owner/admin), a `requireRole` gate on approvals, and `POST /api/dev/set-role` — none of which are in the schema or the routes. Approvals are provider-scoped, not role-scoped. It also states "No artifact file storage yet (only metadata)" (S3 presign upload/download is implemented), "Agent code not yet written (Python)" (~1,900 lines exist), and omits the whole agent-polling, trust-score, email-queue, metrics, and sweeper surface. It misses `POST /api/check/user-key`, `GET /api/agent/jobs/next`, `GET /api/agent/kaggle-credentials`, `PATCH /api/jobs/:id/status`, and the artifact presign/download routes.

**D-2 · Low — stray workspace artifacts.** `progress.md` at the repo root is a redirect stub pointing into `.agents/` (91 gitignored agent scratch directories). `fe/.humaninloop/memory/codebase-analysis.md` is a frontend-only analysis nested under `fe/` rather than at the repo root.

## 8. Recommendations

Ordered by ratio of risk removed to effort:

1. **Authenticate the socket handshake** and run `canViewJob` inside `join-job`. Single file, closes the widest hole (S-2).
2. **Fix CI first** (C-1): add a `lint` script to `be`, and either add a real test runner or drop the `test` job. Nothing else is verifiable while CI is red.
3. **Enforce the state machine** — call `canTransition(job.status, status)` in `PATCH /api/jobs/:id/status`, and only award trust on a transition the backend considers legal (S-3).
4. **Rebind re-queued jobs**: on `queued`, keep `providerId` authoritative and require the claiming agent's machine to belong to it in `/api/agent/jobs/next` (S-4).
5. **Scope `GET /api/machines`** — drop `?all=true` or gate it behind a real role, which means deciding whether roles exist at all (S-1, S-5).
6. **Rotate and placeholder the example secret**, untrack `be/cookies.txt`, and drive CORS/`trustedOrigins` from `FRONTEND_URL` (S-6, S-7).
7. **Repair the deploy health check** — point it at the backend's actual `/health` on 3005 (or add a Next `app/api/health/route.ts`) and fix the retry arithmetic (C-2, C-3).
8. **Promote `be/scripts/` into a real test suite** and add a pytest job for the agent. The verification logic is already written; it's just unversioned and unrun.
9. **Rewrite `CLAUDE.md`** against the current schema and route table (D-1) — stale instructions actively mislead future work.
10. **Introduce a structured logger with request ids.** The metrics story is already good; the log story is the gap.
