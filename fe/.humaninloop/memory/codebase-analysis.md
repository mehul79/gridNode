# GridNode Frontend Codebase Analysis

## 1. Executive Summary & Identity

| Attribute | Details |
| :--- | :--- |
| **Project Name** | GridNode Frontend (`fe`) |
| **Project Type** | Web Application (Node.js / TypeScript / Next.js) |
| **Framework** | Next.js 16.1.6 (App Router), React 19.2.3 |
| **Styling & UI** | Tailwind CSS v4 (`@tailwindcss/postcss`), Radix UI Primitives, Lucide Icons |
| **State & Data Fetching** | Custom REST API Client (`lib/api.ts`), Socket.io WebSocket Client (`lib/socket-context.tsx`) |
| **Authentication** | Better-Auth (`better-auth/react`) |
| **Target Backend API** | Express Backend (`NEXT_PUBLIC_API_URL`, default: `http://localhost:3005`) |
| **Target WebSocket** | Socket.io Server (`NEXT_PUBLIC_SOCKET_URL`, default: `http://localhost:3005`) |

---

## 2. Directory Structure & File Inventory

```
fe/
├── app/                        # Next.js App Router Pages & Layouts
│   ├── layout.tsx              # Root layout with SocketProvider, Navbar & Toaster
│   ├── globals.css             # Tailwind v4 styles, custom CSS variables, dark theme
│   ├── page.tsx                # Main Dashboard (job stats, quick actions, recent jobs)
│   ├── login/
│   │   └── page.tsx            # Auth Login view (Better-Auth)
│   ├── jobs/
│   │   ├── page.tsx            # Jobs Listing & Filter view
│   │   └── [id]/
│   │       └── page.tsx        # Real-time Job Detail, WebSocket logs, Artifact downloads
│   ├── machines/
│   │   └── page.tsx            # Provider Machine Dashboard (Specs, Trust Score, Keys)
│   └── approvals/
│       └── page.tsx            # Machine Owner Approval Queue
├── components/                 # Application & Custom UI Components
│   ├── Navbar.tsx              # Navigation bar with dynamic machine-owner links & auth menu
│   ├── JobCard.tsx             # Reusable card component for displaying job summaries
│   ├── JobCreateModal.tsx      # Job submission modal with CPU/RAM/GPU tier pickers
│   ├── StatusBadge.tsx         # Unified status pill renderer for jobs & machines
│   └── ui/                     # Shadcn UI / Radix primitives (avatar, badge, button, etc.)
├── lib/                        # Core Utilities & External Services
│   ├── api.ts                  # Centralized REST fetch wrapper for Express backend
│   ├── auth-client.ts          # Better-Auth React client instance
│   ├── socket-context.tsx      # WebSocket context provider using socket.io-client
│   └── utils.ts                # Tailwind class blending utility (`cn`)
├── hooks/
│   └── use-toast.ts            # UI toast notification hook
├── types/
│   └── api.ts                  # Authoritative TypeScript domain interfaces & types
└── package.json                # Project dependencies & npm scripts
```

---

## 3. Domain Model & Entity Inventory

### Core Entities (`types/api.ts`)

#### `Job`
Represents a compute job submitted by a requester.
- **Attributes**: `id`, `type` (`ml_notebook` | `video_render` | `server_run` | `data_processing`), `repoUrl`, `command`, `kaggleDatasetUrl`, `cpuTier` (`light` | `medium` | `heavy`), `memoryTier` (`gb8` | `gb16` | `gb32` | `gb64`), `gpuMemoryTier` (`gb8` | `gb12` | `gb16` | `gb24` | `gb32` | `gb48` | null), `estimatedDuration` (`lt1h` | `h1_6` | `h6_12` | `h12_24` | `gt24h`), `gpuVendor` (`nvidia` | `amd` | `intel`), `status` (`draft` | `pending_approval` | `approved` | `rejected` | `queued` | `assigned` | `running` | `completed` | `failed` | `preempted` | `cancelled`), `requesterId`, `machineId`, `approval`, `machine`, `logsCount`, `artifactsCount`, `events`.

#### `Machine`
Represents a hardware compute node registered by a provider.
- **Attributes**: `id`, `ownerId`, `userKey`, `cpuTotal`, `memoryTotal`, `gpuTotal`, `gpuMemoryTotal`, `gpuVendor`, `status` (`idle` | `running` | `offline`), `lastHeartbeatAt`, `trustScore` (0.0 to 100.0, default 50.0), `totalJobsCompleted`, `totalJobsFailed`.

#### `Approval`
Represents an authorization check required before executing a job on a target machine.
- **Attributes**: `id`, `jobId`, `status` (`pending` | `approved` | `rejected`), `decidedById`, `decidedAt`, `job`.

#### `JobLog` & `JobEvent`
- **JobLog**: `id`, `jobId`, `sequence`, `line`, `stream` (`stdout` | `stderr`).
- **JobEvent**: `id`, `jobId`, `type`, `payload`, `actorId`, `createdAt`.

#### `Artifact`
- **Attributes**: `id`, `jobId`, `filename`, `storagePath`, `mimeType`, `sizeBytes`.

---

## 4. Essential Floor Assessment

| Category | Assessment | Status | Evidence |
| :--- | :--- | :--- | :--- |
| **Security** | Auth & Session Verification | **Present** | `Better-Auth` integration with cookie credentials (`credentials: "include"`), automatic redirects to `/login` for unauthenticated routes, user key display for agent registration. |
| **Testing** | Automated Test Framework | **Absent** | No test framework (Jest, Vitest, Playwright) or test files currently configured in `package.json`. |
| **Error Handling** | API & UI Exception Management | **Present** | Centralized error handler in `lib/api.ts` (`fetchApi`), UI error toasts, boundary fallbacks for failed network calls. |
| **Observability** | Real-time Logs & Audit Trail | **Present** | Socket.io WebSocket connection for live stdout/stderr log streaming with sequence-based pagination fallback (`/api/jobs/:id/logs`), job event timeline rendering. |

---

## 5. Architectural Patterns & Data Flow

1. **REST API Wrapper (`lib/api.ts`)**:
   - Uses `fetchApi<T>()` with default `credentials: "include"` for session pass-through.
   - Provides strongly-typed functions for Job CRUD, Machine Registration/Heartbeat/Reclaim, and Approvals.

2. **Real-time WebSockets (`lib/socket-context.tsx`)**:
   - React context wrapping the app with `socket.io-client`.
   - Manages connection lifecycle and exposes `joinJob(jobId)` and `leaveJob(jobId)` methods to isolate streaming logs into job-specific socket rooms.

3. **Job Detail Page (`app/jobs/[id]/page.tsx`)**:
   - Subscribes to real-time `job-log` socket events on mount.
   - Combines historical REST logs (`getJobLogs`) with live WebSocket stream lines.
   - Provides direct presigned download access for output artifacts.

---

## 6. Preserved Code Conventions & Strengths

- **Strict TypeScript Typing**: End-to-end type safety shared across API client responses and component props via `types/api.ts`.
- **Clean Component Modularization**: UI primitives separated into `components/ui/`, with clear feature components (`JobCard`, `JobCreateModal`, `StatusBadge`).
- **Design Excellence**: Modern dark-theme styled interface using Tailwind CSS v4, Lucide icons, and responsive layouts.

---

## 7. Recommendations for Next Steps

1. **Add Unit/Integration Testing**: Introduce Vitest and React Testing Library to test `JobCreateModal` tier validation and `lib/api.ts` response handling.
2. **Setup Codebase Memory**: Preserve this report in `.humaninloop/memory/codebase-analysis.md` for consistent agent reference across future turns.
