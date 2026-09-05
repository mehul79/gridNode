# GridNode - Claude Code Guidelines

## Project Overview

GridNode is a distributed compute platform where requesters submit jobs (ML notebooks or video processing), owners approve them, and agents run them in Docker containers on the owner's machine.

**Tech Stack:**
- Backend: Express + TypeScript, Prisma, PostgreSQL, Better Auth, Socket.IO
- Frontend: Next.js 16 (App Router), Tailwind CSS, shadcn/ui
- Agent: Python (`agent/computeshare_agent/`), runs jobs in Docker under gVisor

---

## Quick Start

### Backend (`be/`)
```bash
cd be
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID/SECRET
npx prisma generate
npx prisma migrate dev
npm run dev    # Port 3005
npm run lint   # ESLint
npm test       # Unit tests (node:test)
```

### Frontend (`fe/`)
```bash
cd fe
npm install  # if not done
# shadcn/ui dependencies already installed
npm run dev  # Port 3000
```

---

## Architecture

### Backend (`be/src/`)
- `index.ts` - Entry point, Express app, Socket.IO init
- `router/` - Mounts all route routers at `/api`
- `routes/` - REST endpoints: jobs, approvals, machines, auth
- `middleware/` - Authentication: `requireAuth`, `requireAgentAuth`
- `lib/` - DB client, auth config, helpers: `jobStatus.ts`, `jobAccess.ts`, `jobEvents.ts`, `token.ts`, `matchCriteria.ts`, `sweeper.ts`, `s3.ts`, `email.ts`, `gpu.ts`, `config.ts`
- `queues/` - BullMQ email queue and worker (Redis)
- `sockets/` - Socket.IO server, room management, emit helpers

### Database Models (Prisma)
- `User` - identity plus `userKey` (the token an agent registers with). There is no `role` column; permissions are derived from a job's `requesterId` / `providerId` and a machine's `ownerId`
- `Machine` - owner's compute resource (CPU/RAM/GPU)
- `Job` - main entity (type: `ml_notebook` | `video_render` | `server_run` | `data_processing`; resources expressed as tiers; 11-state status lifecycle)
- `Approval` - 1:1 with Job, tracks approval decision
- `JobEvent` - audit log of job events
- `JobLog` - sequential log lines (by `sequence`)
- `Artifact` - output file metadata
- `AgentSession` - machine authentication tokens

### Frontend (`fe/`)
- `app/` - Next.js App Router pages
- `lib/` - auth client, API client (to be created), Socket context
- `components/` - Reusable UI components (to be built)
- `types/` - TypeScript interfaces (to be created)

---

## Authentication

**User (Browser):**
- Better Auth with Google OAuth
- Session cookie auto-sent with requests to same origin
- Protected routes: `requireAuth` middleware

**Agent (Machine):**
- Token-based: machine registration returns `sessionToken`
- Sent as `Authorization: Bearer <token>` or in body
- Protected routes: `requireAgentAuth` middleware

---

## API Endpoints Summary

### User Routes (require session cookie)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/check/me` | Get current user (+ machine count) |
| POST | `/api/check/user-key` | Generate/regenerate the agent registration key |
| GET | `/api/machines` | List current user's machines |
| POST | `/api/machines/register` | Register machine + get agent token |
| POST | `/api/machines/:id/reclaim` | Owner reclaims machine (preempt jobs) |
| GET | `/api/jobs` | List jobs viewable by user |
| POST | `/api/jobs` | Create job (with Approval + JobEvent) |
| GET | `/api/jobs/:id` | Job detail |
| POST | `/api/jobs/:id/stop` | Stop job (cancel/preempt) |
| GET | `/api/jobs/:id/logs` | Paginated logs |
| GET | `/api/jobs/:id/artifacts` | List artifacts |
| GET | `/api/jobs/:id/artifacts/:artifactId/download` | Presigned S3 download URL |
| GET | `/api/approvals/pending` | List pending approvals (owner/admin) |
| POST | `/api/approvals/:id/approve` | Approve job |
| POST | `/api/approvals/:id/reject` | Reject job |

Approvals are scoped to the job's `providerId` (the owner of the matched machine), not to a role.

### Agent Routes (require Bearer token)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/machines/register` | Register machine + get agent token (authenticated by `userKey`) |
| POST | `/api/machines/:id/heartbeat` | Update heartbeat |
| GET | `/api/agent/jobs/next` | Claim the next job for this machine |
| GET | `/api/agent/kaggle-credentials` | Fetch platform Kaggle credentials |
| PATCH | `/api/jobs/:id/status` | Report job status (validated against the state machine) |
| POST | `/api/jobs/:id/logs` | Append log lines |
| POST | `/api/jobs/:id/artifacts` | Register artifact |
| POST | `/api/jobs/:id/artifacts/presign` | Presigned S3 upload URL |

---

## Current Frontend State

**Implemented (2026-04-03):**
- Login page (`/login`) with Google OAuth
- Dashboard (`/`) with stats and job listing
- Jobs page (`/jobs`) with filters, create modal, stop action
- Job detail page (`/jobs/[id]`) with live logs (Socket.IO), artifacts, events
- Approvals page (`/approvals`) for owners (list, approve, reject)
- Machines page (`/machines`) - register machine, list, copy token, reclaim
- shadcn/ui components integrated
- Socket.IO real-time connections

**Architecture:**
- Next.js 16 App Router
- TypeScript types from backend schema
- API client `fe/lib/api.ts`
- Socket context `fe/lib/socket-context.tsx`

All backend APIs fully integrated.

---

## Development Workflow

1. **Start backend & frontend** in separate terminals
2. **Test API** with cURL or Postman before building UI
3. **Use Prisma Studio** (`npx prisma studio`) to inspect/inspect DB
4. **Check server logs** for errors (both backend and frontend)
5. **Socket.IO**: open browser console to see connection logs

---

## Common Tasks

### Become a provider
Register a machine with your `userKey` (Machines page → generate key, then run the
agent). Jobs are matched to machines owned by *other* users, so you need two
accounts to exercise the full request → approve → run flow.

### Manually insert logs to test UI
```sql
INSERT INTO "JobLog" (id, jobId, sequence, line, stream, "createdAt")
VALUES ('...', 'job-id', 1, 'Hello World', 'stdout', NOW());
```

### Reset database
```bash
cd be
npx prisma migrate reset  # WARNING: drops all data
```

### Generate Prisma client after schema change
```bash
cd be
npx prisma generate
```

---

## Testing Checklist

- [ ] Backend server starts on port 3005
- [ ] Database migrations applied successfully
- [ ] Login with Google works, session persists
- [ ] `/api/check/me` returns user data
- [ ] Jobs can be created (status=pending_approval)
- [ ] Approvals page shows pending jobs (as owner)
- [ ] Approve/reject transitions job status correctly
- [ ] Machine registration returns sessionToken
- [ ] Agent heartbeat accepts token
- [ ] Job detail page shows logs via Socket.IO
- [ ] `npm run lint` and `npm test` pass in `be/`, `npm run lint` passes in `fe/`
- [ ] `python3 -m pytest` passes in `agent/computeshare_agent/`

---

## Notes

- Artifacts are stored in S3 via presigned upload/download URLs (`lib/s3.ts`)
- Scheduling is pull-based: `POST /api/jobs` best-fit matches an eligible machine
  (see `lib/matchCriteria.ts`), and the agent claims work via `GET /api/agent/jobs/next`.
  A job can only be claimed by a machine belonging to its `providerId`.
- Agent status reports are validated against the `lib/jobStatus.ts` state machine
- `lib/sweeper.ts` fails jobs on machines that stop heartbeating (3 min timeout)
- Browser origins for CORS, Better Auth and Socket.IO all come from
  `FRONTEND_URL` / `ALLOWED_ORIGINS` (`lib/config.ts`)
- Socket.IO requires the Better Auth session cookie, and `join-job` is authorized
  with the same check as `GET /api/jobs/:id`

---

## References

- Backend guide: See `.claude/context.md` for detailed architecture
- Plan file: `.claude/plans/gridnode-frontend-integration.md`
- Plan mode: Use EnterPlanMode for substantial changes
