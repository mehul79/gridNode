# GridNode Project Context

## Last Commit: Schema Changes (0c744e7)

Recent commit extended Prisma schema with:
- New enums: JobType, JobStatus, ApprovalStatus, AgentSessionStatus
- Extended Job model: type, notebookPath, timeoutSeconds, updatedAt, relations
- New models: Approval, JobEvent, JobLog, Artifact, AgentSession
- Fixed User-Job relations (split into jobsRequested, jobsOwned)
- Machine: added lastHeartbeatAt
- Migration: `20260402185427_schema_jobs_approvals_events_logs`

**Status**: All migrations applied, database up-to-date.

---

## Frontend Implementation Status (Completed 2026-04-03)

### Built with Next.js 16 + shadcn/ui + Tailwind

**Pages:**
- `/` - Dashboard with stats, job list, role switcher (dev)
- `/jobs` - Job listing with filters (status, type), create job modal
- `/jobs/[id]` - Job detail with live logs (Socket.IO), artifacts, events
- `/approvals` - Pending approvals list, approve/reject actions (owner only)
- `/machines` - Register machine, list user's machines, copy session token, reclaim

**Components:**
- UI: Button, Card, Badge, Input, Textarea, Select, Dialog, Avatar, DropdownMenu, Toast
- Custom: Navbar, JobCard, JobCreateModal, StatusBadge, MachineStatusBadge
- Context: SocketProvider for real-time

**API Integration:**
- All backend endpoints integrated via `fe/lib/api.ts`
- Socket.IO client connects to `localhost:3005`, joins job rooms
- Auth: Better Auth session cookie auto-sent with fetch

**Dev Features:**
- Role switcher on dashboard (dev only) - calls `POST /api/dev/set-role`
- Full user fetch from `/api/check/me` to get role

**Status**: Frontend fully functional and integrated with backend APIs. Ready for testing.

---

## Backend Implementation Status

### ✅ Fully Implemented APIs

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/check/me` | GET | User | Get current user (with role) |
| `/api/dev/set-role` | POST | User | **Dev only**: Switch user role (owner/requester) |
| `/api/machines` | GET | User | List current user's machines |
| `/api/machines/register` | POST | User | Register machine, return sessionToken |
| `/api/machines/:id/heartbeat` | POST | Agent | Update machine heartbeat |
| `/api/machines/:id/reclaim` | POST | User (owner) | Reclaim machine, preempt jobs |
| `/api/jobs` | GET | User | List viewable jobs (with optional status filter) |
| `/api/jobs` | POST | User | Create job with pending approval |
| `/api/jobs/:id` | GET | User | Get job detail (with approval, machine, counts) |
| `/api/jobs/:id/stop` | POST | User (owner/requester) | Stop job (cancel/preempt) |
| `/api/jobs/:id/logs` | GET | User | Paginated logs (afterSequence) |
| `/api/jobs/:id/logs` | POST | Agent | Append log lines (sequence auto-increment) |
| `/api/jobs/:id/artifacts` | GET | User | List artifact metadata |
| `/api/jobs/:id/artifacts` | POST | Agent | Register artifact |
| `/api/approvals/pending` | GET | User (owner/admin) | List pending approvals with job details |
| `/api/approvals/:id/approve` | POST | User (owner/admin) | Approve job (atomic: Approval+Job+Event) |
| `/api/approvals/:id/reject` | POST | User (owner/admin) | Reject job (atomic transaction) |

### 🔄 Partially Implemented
- All endpoints have working UI via Prisma Studio or cURL
- **Frontend pages are built and integrated** (see Frontend Implementation above)

### ❌ Not Implemented (Out of Scope)
- Scheduler (assigns approved jobs to machines)
- Python agent (backend ready, agent protocol defined)
- Artifact file upload/download (S3 or local storage)
- Job timeout enforcement

---

## Database Schema Reference

### Enums
```prisma
JobType: notebook | video
JobStatus: draft | pending_approval | approved | rejected | queued | assigned | running | completed | failed | preempted | cancelled
ApprovalStatus: pending | approved | rejected
AgentSessionStatus: active | revoked
```

### Key Models
- **User**: id, email, name, role (requester/owner/admin), relations to jobs (requester/owner), machines, approvalsDecided
- **Machine**: id, ownerId, cpuTotal, memoryTotal, gpuTotal, status, lastHeartbeatAt, jobs[], sessions[]
- **Job**: id, requesterId, ownerId?, machineId?, type, repoUrl, command?, notebookPath?, datasetUri?, cpuRequired, memoryRequired, gpuRequired, timeoutSeconds, status, createdAt, updatedAt, approval?, events[], logs[], artifacts[]
- **Approval**: id, jobId (unique), status, decidedById?, decidedAt?, createdAt
- **JobEvent**: id, jobId, type, payload (JSON), actorId?, createdAt
- **JobLog**: id, jobId, sequence (unique per job), line, stream?, createdAt
- **Artifact**: id, jobId, filename, storagePath, mimeType?, sizeBytes?, createdAt
- **AgentSession**: id, machineId, tokenHash (unique), status, lastHeartbeatAt?, createdAt

---

## Authorization Rules

### Job Visibility (`canViewJob`)
Returns true if:
1. User is the job requester
2. User is the job owner (ownerId)
3. User owns the machine the job is assigned to
4. User has role `owner` or `admin` AND job status is `pending_approval` (global queue)

### Job Stop (`canStopJob`)
Returns true if:
1. User is the job requester → results in `cancelled` status
2. User has role `owner`/`admin` AND is job owner or machine owner → results in `preempted` status

### Role-Based (`requireOwnerOrAdmin`)
Middleware: user.role must be `"owner"` or `"admin"`

---

## State Machine

```
draft
  ↓ (create)
pending_approval
  ├→ approved (owner approves)
  └→ rejected (owner rejects)
approved
  ↓ (scheduler, manual)
queued
  ↓ (assign)
assigned
  ├→ running (agent starts)
  └→ failed (assignment fails)
running
  ├→ completed (success)
  ├→ failed (error)
  ├→ preempted (owner reclaims)
  └→ cancelled (requester stops)
```

**Transitions**: `jobStatus.canTransition(from, to)`
- Direct transitions only (no skipping)
- `cancelled` and `preempted` allowed from any non-terminal state

---

## Socket.IO

**Server** (`be/src/sockets/index.ts`):
- CORS: `origin: "http://localhost:3000"`
- Rooms: `job-<jobId>`
- Events: `"log"` (string), `"job-update"` (object)

**Emitters**:
- `emitLog(jobId, line)` - real-time log streaming
- `emitJobUpdate(jobId, data)` - job status/artifact updates

**Client** (to be built):
- Connect to `http://localhost:3005`
- Authenticated user joins `job-<id>` room when viewing job detail
- Listen for `"log"` and `"job-update"` events

---

## Frontend Build Plan

See `.claude/plans/gridnode-frontend-integration.md` for complete implementation plan.

### Priority Pages
1. **Dashboard** (`/`) - Stats, role switcher (dev), quick links
2. **Jobs** (`/jobs`) - List + create modal
3. **Job Detail** (`/jobs/[id]`) - Info + live logs + artifacts
4. **Approvals** (`/approvals`) - Pending list + approve/reject (owner only)
5. **Machines** (`/machines`) - Register + list + token copy

### Tech Stack (Frontend)
- Next.js 16 (App Router)
- Better Auth client (session management)
- Tailwind CSS + **shadcn/ui** components
- Socket.IO client for real-time
- TypeScript types from backend schema

---

## Testing Guide

### Prerequisites
- Backend running on port 3005
- Frontend running on port 3000
- Google OAuth configured (or use test accounts)
- Database seeded with at least 2 users: one requester, one owner

### Quick E2E Test Flow

1. **Login** as requester
2. **Register machine** (any specs) → copy `sessionToken` from response
3. **Create job**: notebook type, repoUrl=`https://github.com/test/repo`, notebookPath=`test.ipynb`
4. **Logout**, Login as **owner** (or use dev role switcher)
5. **Approve job** from `/approvals` page
6. **View job detail** → status should be `approved`
7. **(Optional) Simulate agent**:
   - Use `sessionToken` to call `POST /api/machines/:id/heartbeat`
   - Update job.machineId manually in DB via Prisma Studio
   - Set job.status to `assigned`
   - POST logs to `/api/jobs/:id/logs` with token
   - Frontend should see real-time logs via Socket.IO
8. **Stop job** as requester or owner

---

## Environment Variables

### Backend (`.env`)
- `DATABASE_URL` - PostgreSQL connection
- `BETTER_AUTH_SECRET` - Random 32+ char string
- `BETTER_AUTH_URL` - `http://localhost:3005`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `NODE_ENV` - `development` or `production`

### Frontend (`.env.local` - optional)
- `NEXT_PUBLIC_API_URL` - `http://localhost:3005`
- `NEXT_PUBLIC_SOCKET_URL` - `http://localhost:3005`

---

## Common Commands

```bash
# Backend
cd be
npm run dev              # Start dev server (port 3005)
npm run build           # Build to dist/
npx prisma studio       # Open DB studio (port 5555)
npx prisma generate     # Generate client after schema change
npx prisma migrate dev  # Create/apply migrations

# Frontend
cd fe
npm run dev             # Start dev server (port 3000)
npm run build           # Build production
npm run lint            # Run ESLint
```

---

## Architecture Decisions

1. **Auth**: Better Auth for simplicity; session cookie for users, token for agents
2. **Socket.IO**: Unauthenticated rooms; user must already have access via HTTP auth
3. **Log streaming**: Agent batches lines up to 500, server assigns sequence numbers
4. **Approve/Reject**: Atomic transaction updates Approval, Job, and creates JobEvent
5. **Reclaim**: Owner can preempt jobs on their machine; sets status to `preempted` and clears machineId
6. **Stop**: Requester→cancel, Owner/admin→preempt; both create `stop_requested` event

---

## What's Next (After Frontend)

1. **Scheduler**: Simple first-fit algorithm to assign `approved` jobs to suitable machines
2. **Python Agent**: Register machine, poll for assigned jobs, run Docker, stream logs, upload artifacts
3. **Artifact Storage**: Local filesystem or MinIO/S3 for file uploads/downloads
4. **Testing**: Jest unit tests for helpers, integration tests for APIs
5. **Monitoring**: Grafana dashboard, alerts (as per README)

---

## Debugging Tips

| Issue | Likely Cause | Fix |
|-------|--------------|-----|
| 401 on API calls | Not logged in / expired session | Re-login at `/login` |
| CORS error | Frontend port mismatch | Check backend `cors.origin` is `http://localhost:3000` |
| Socket.IO not connecting | Server not running on 3005 | Verify backend is up |
| Can't see logs in UI | Didn't join room or no logs | Check console for "join-job" event; manually insert logs in DB |
| Role switcher not visible | Not in dev mode | Ensure `NODE_ENV=development` |
| Prisma client errors | Schema changed, client stale | Run `npx prisma generate` |

---

## File Locations

**Backend**: `be/src/`
- Routes: `be/src/routes/`
- Middleware: `be/src/middleware/`
- Lib: `be/src/lib/`
- Schema: `be/prisma/schema.prisma`

**Frontend**: `fe/`
- Pages: `fe/app/`
- Components: `fe/components/` (created)
- Lib: `fe/lib/`
- Types: `fe/types/` (created)

**Project Plan**: `.claude/plans/gridnode-frontend-integration.md`
**This Context**: `.claude/context.md` (this file)
**Claude Guidelines**: `CLAUDE.md`

---

## Last Updated

2026-04-03 - Frontend built and integrated; all core pages and components complete.
