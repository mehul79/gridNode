export type JobType = "notebook" | "video";
export type JobStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "queued"
  | "assigned"
  | "running"
  | "completed"
  | "failed"
  | "preempted"
  | "cancelled";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface Machine {
  id: string;
  ownerId: string;
  cpuTotal: number;
  memoryTotal: number;
  gpuTotal: number;
  status: string;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  jobId: string;
  status: ApprovalStatus;
  decidedById: string | null;
  decidedAt: string | null;
  createdAt: string;
  job: Job;
}

export interface JobEvent {
  id: string;
  jobId: string;
  type: string;
  payload: Record<string, unknown> | null;
  actorId: string | null;
  createdAt: string;
}

export interface JobLog {
  id: string;
  jobId: string;
  sequence: number;
  line: string;
  stream: "stdout" | "stderr" | null;
  createdAt: string;
}

export interface Artifact {
  id: string;
  jobId: string;
  filename: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface Job {
  id: string;
  type: JobType;
  repoUrl: string;
  command: string | null;
  notebookPath: string | null;
  datasetUri: string | null;
  cpuRequired: number;
  memoryRequired: number;
  gpuRequired: number;
  timeoutSeconds: number;
  status: JobStatus;
  requesterId: string;
  ownerId: string | null;
  machineId: string | null;
  createdAt: string;
  updatedAt: string;
  approval: Approval | null;
  machine: Machine | null;
  logsCount: number;
  artifactsCount: number;
  events?: JobEvent[];
}

export interface PaginatedLogs {
  logs: JobLog[];
  nextAfterSequence: number;
}

export interface MachineRegisterResponse extends Machine {
  sessionToken: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
