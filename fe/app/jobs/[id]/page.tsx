"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getJob, getJobArtifactDownloadUrl, getJobArtifacts, getJobLogs, stopJob } from "@/lib/api";
import { useSocket } from "@/lib/socket-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Download, Square, Terminal } from "lucide-react";
import Link from "next/link";
import {
  Job,
  JobLog,
  JobEvent,
  MemoryTier,
  GpuMemoryTier,
  DurationTier,
  Artifact,
} from "@/types/api";
import StatusBadge from "@/components/StatusBadge";
import { formatDistanceToNow } from "date-fns";

function formatMemoryTier(tier: MemoryTier): string {
  return tier.replace("gb", "") + " GB";
}

function formatGpuMemory(tier: GpuMemoryTier | null): string {
  if (!tier) return "None";
  return tier.replace("gb", "") + " GB";
}

function formatCpuTier(tier: string): string {
  const labels: Record<string, string> = {
    light: "Light (2-4 cores)",
    medium: "Medium (4-8 cores)",
    heavy: "Heavy (8+ cores)",
  };
  return labels[tier] || tier;
}

function formatDurationTier(tier: DurationTier | null): string {
  if (!tier) return "";
  const labels: Record<DurationTier, string> = {
    lt1h: "< 1 hour",
    h1_6: "1-6 hours",
    h6_12: "6-12 hours",
    h12_24: "12-24 hours",
    gt24h: "24+ hours",
  };
  return labels[tier];
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  const { socket, isConnected, joinJob, leaveJob } = useSocket();
  const { toast } = useToast();

  const [job, setJob] = useState<Job | null>(null);
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [downloadingArtifactId, setDownloadingArtifactId] = useState<string | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const nextSequenceRef = useRef(0);
  const isFetchingLogs = useRef(false);
  const pendingLogsFetchType = useRef<"incremental" | "full" | null>(null);
  const currentJobIdRef = useRef(jobId);

  useEffect(() => {
    currentJobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    nextSequenceRef.current = 0;
    isFetchingLogs.current = false;
    pendingLogsFetchType.current = null;
    setJob(null);
    setLogs([]);
    setEvents([]);
    setArtifacts([]);
    setError(null);
    setLogsError(null);
    setArtifactsError(null);
    setLoading(true);
  }, [jobId]);

  const fetchJob = useCallback(async () => {
    try {
      const data = await getJob(jobId);
      if (jobId !== currentJobIdRef.current) return;
      setJob(data);
      setEvents(data.events || []);
    } catch (e: unknown) {
      if (jobId !== currentJobIdRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (jobId === currentJobIdRef.current) {
        setLoading(false);
      }
    }
  }, [jobId]);

  const fetchLogs = useCallback(
    async (afterSequence?: number) => {
      const isFull = afterSequence === 0;
      const targetSequence = afterSequence !== undefined ? afterSequence : nextSequenceRef.current;

      if (isFetchingLogs.current) {
        if (jobId === currentJobIdRef.current) {
          if (isFull) {
            pendingLogsFetchType.current = "full";
          } else if (pendingLogsFetchType.current !== "full") {
            pendingLogsFetchType.current = "incremental";
          }
        }
        return targetSequence;
      }

      if (jobId === currentJobIdRef.current) {
        isFetchingLogs.current = true;
        setLogsError(null);
      }

      try {
        const data = await getJobLogs(jobId, targetSequence, 5000);
        
        if (jobId !== currentJobIdRef.current) return targetSequence;
        
        setLogs((prev) => {
          if (targetSequence === 0) {
            return data.logs.sort((a, b) => a.sequence - b.sequence);
          }
          const existingSeqs = new Set(prev.map((l) => l.sequence));
          const newLogs = data.logs.filter((l) => !existingSeqs.has(l.sequence));
          return [...prev, ...newLogs].sort((a, b) => a.sequence - b.sequence);
        });
        nextSequenceRef.current = data.nextAfterSequence;
        return data.nextAfterSequence;
      } catch (e: unknown) {
        if (jobId !== currentJobIdRef.current) return targetSequence;
        console.error("Failed to fetch logs", e);
        setLogsError(e instanceof Error ? e.message : "Failed to load logs.");
      } finally {
        if (jobId === currentJobIdRef.current) {
          isFetchingLogs.current = false;
          const nextFetchType = pendingLogsFetchType.current;
          if (nextFetchType !== null) {
            pendingLogsFetchType.current = null;
            if (nextFetchType === "full") {
              fetchLogs(0);
            } else {
              fetchLogs();
            }
          }
        }
      }
      return targetSequence;
    },
    [jobId],
  );

  const fetchArtifacts = useCallback(async () => {
    try {
      if (jobId !== currentJobIdRef.current) return;
      setArtifactsError(null);
      const data = await getJobArtifacts(jobId);
      if (jobId !== currentJobIdRef.current) return;
      setArtifacts(data);
    } catch (e: unknown) {
      if (jobId !== currentJobIdRef.current) return;
      console.error("Failed to fetch artifacts", e);
      setArtifactsError(e instanceof Error ? e.message : "Failed to load artifacts.");
    }
  }, [jobId]);

  const downloadArtifact = async (artifact: Artifact) => {
    try {
      setDownloadingArtifactId(artifact.id);
      const { downloadUrl } = await getJobArtifactDownloadUrl(jobId, artifact.id);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      toast({
        title: "Download Started",
        description: `Downloading ${artifact.filename}...`,
      });
    } catch (error: unknown) {
      console.error("Failed to get artifact download URL from backend", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: error instanceof Error ? error.message : "Failed to retrieve download link. Please try again.",
      });
    } finally {
      setDownloadingArtifactId(null);
    }
  };

  useEffect(() => {
    fetchJob();
    fetchLogs();
    fetchArtifacts();
  }, [fetchJob, fetchLogs, fetchArtifacts]);

  // Socket.IO: join room and listen for logs
  useEffect(() => {
    if (socket && isConnected && jobId) {
      joinJob(jobId);

      const handleLog = () => {
        // Append a pseudo-log (server doesn't send full object, just string)
        // In a real implementation, the server should send { line, sequence, stream }
        // For now, we'll refetch logs
        fetchLogs();
      };

      const handleJobUpdate = (data: { jobId: string; type?: string }) => {
        if (data.jobId === jobId) {
          fetchJob(); // refresh job status
          if (data.type === "artifact") {
            fetchArtifacts();
          }
        }
      };

      socket.on("log", handleLog);
      socket.on("job-update", handleJobUpdate);

      return () => {
        socket.off("log", handleLog);
        socket.off("job-update", handleJobUpdate);
        leaveJob(jobId);
      };
    }
  }, [
    socket,
    isConnected,
    jobId,
    joinJob,
    leaveJob,
    fetchJob,
    fetchLogs,
    fetchArtifacts,
  ]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleStop = async () => {
    if (!confirm("Stop this job?")) return;
    setStopping(true);
    try {
      await stopJob(jobId);
      await fetchJob();
      toast({
        title: "Job Stopped",
        description: "The job was stopped successfully.",
      });
    } catch (e: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to Stop Job",
        description: e instanceof Error ? e.message : "An error occurred while stopping the job.",
      });
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="text-center text-destructive py-12">
        {error || "Job not found"}
        <Button
          variant="outline"
          className="ml-4"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const isTerminal = [
    "completed",
    "failed",
    "preempted",
    "cancelled",
    "rejected",
  ].includes(job.status);
  const canStop = !isTerminal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="space-y-1">
          <Link href="/jobs" className="text-[10px] uppercase font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mb-2">
            &lt;- Back_To_Queue
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold uppercase tracking-wider text-foreground">JOB_{job.id.substring(0,8)}</h1>
            <StatusBadge status={job.status} />
          </div>
          <div className="text-[10px] font-mono text-muted-foreground uppercase">
            {job.type.replace('_', ' ')} // {job.id}
          </div>
        </div>
        {canStop && (
          <button
            onClick={handleStop}
            disabled={stopping}
            className="flex items-center gap-2 bg-destructive/10 text-destructive border border-destructive/50 px-4 py-2 text-xs font-mono uppercase tracking-wider hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            {stopping && <Loader2 className="h-3 w-3 animate-spin" />}
            <Square className="h-3 w-3" />
            Halt Execution
          </button>
        )}
      </div>

      <div className="border border-border">
        <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-12">
          
          {/* Metadata Panel */}
          <div className="col-span-1 bg-card lg:col-span-4 flex flex-col">
            <div className="p-4 border-b border-border bg-background">
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Job Specifications</h2>
            </div>
            <div className="p-4 space-y-4 font-mono text-xs">
              <div>
                <div className="text-muted-foreground mb-1 uppercase text-[10px]">Repository</div>
                <a href={job.repoUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                  {job.repoUrl}
                </a>
              </div>
              
              {job.command && (
                <div>
                  <div className="text-muted-foreground mb-1 uppercase text-[10px]">Command</div>
                  <div className="bg-background border border-border p-2 break-all text-muted-foreground">
                    $ {job.command}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground mb-1 uppercase text-[10px]">Resources</div>
                  <div className="text-foreground">
                    CPU: {formatCpuTier(job.cpuTier)}<br/>
                    RAM: {formatMemoryTier(job.memoryTier)}<br/>
                    GPU: {formatGpuMemory(job.gpuMemoryTier)} {job.gpuVendor && `(${job.gpuVendor})`}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1 uppercase text-[10px]">Duration</div>
                  <div className="text-foreground">
                    Est: {formatDurationTier(job.estimatedDuration) || "--"}<br/>
                    T-{formatDistanceToNow(new Date(job.createdAt))}
                  </div>
                </div>
              </div>

              {job.kaggleDatasetUrl && (
                <div>
                  <div className="text-muted-foreground mb-1 uppercase text-[10px]">Kaggle Dataset</div>
                  <a href={job.kaggleDatasetUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                    {job.kaggleDatasetUrl}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Terminal / Logs Panel */}
          <div className="col-span-1 bg-background lg:col-span-8 flex flex-col h-[500px]">
            <div className="flex items-center justify-between border-b border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> Execution Output
                </h2>
                <div className="flex items-center gap-1.5 text-[10px] font-mono">
                  Socket: 
                  {isConnected ? (
                    <span className="text-primary animate-pulse">CONNECTED</span>
                  ) : (
                    <span className="text-destructive">DISCONNECTED</span>
                  )}
                </div>
              </div>
              <button 
                onClick={() => fetchLogs(0)}
                className="text-[10px] uppercase font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                Refresh_Stream
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-background p-4 font-mono text-xs log-viewer" ref={logsEndRef}>
              {logsError && (
                <div className="text-destructive bg-destructive/10 border border-destructive/20 p-2 mb-4">
                  ERR_FETCH_LOGS: {logsError}
                </div>
              )}
              {logs.length === 0 && !logsError ? (
                <div className="text-muted-foreground italic">Awaiting execution output...</div>
              ) : (
                logs.map((log) => (
                  <div
                    key={`${log.id}-${log.sequence}`}
                    className={`log-line ${log.stream === "stderr" ? "text-warning" : "text-foreground"}`}
                  >
                    <span className="text-muted-foreground opacity-50 select-none mr-3">[{String(log.sequence).padStart(4, '0')}]</span>
                    {log.line}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Artifacts Panel */}
          <div className="col-span-1 bg-card lg:col-span-12 flex flex-col border-t border-border">
            <div className="p-4 border-b border-border bg-background">
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono flex items-center gap-2">
                <Download className="h-3 w-3" /> Job Artifacts
              </h2>
            </div>
            <div className="p-4">
              {artifactsError && (
                <div className="text-destructive text-xs font-mono mb-4">
                  ERR_FETCH_ARTIFACTS: {artifactsError}
                </div>
              )}
              {artifacts.length === 0 && !artifactsError ? (
                <div className="text-muted-foreground text-xs font-mono">No artifacts exported by this job.</div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {artifacts.map((artifact) => (
                    <div key={artifact.id} className="flex items-center gap-2 border border-border bg-background p-2 text-xs font-mono max-w-[300px]">
                      <div className="truncate flex-1 text-foreground" title={artifact.filename}>{artifact.filename}</div>
                      <div className="text-muted-foreground text-[10px] shrink-0">
                        {artifact.sizeBytes ? `${(artifact.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "-- MB"}
                      </div>
                      <button
                        onClick={() => downloadArtifact(artifact)}
                        disabled={downloadingArtifactId === artifact.id}
                        className="text-primary hover:text-primary/80 disabled:opacity-50"
                      >
                        {downloadingArtifactId === artifact.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Events Panel */}
          <div className="col-span-1 bg-background lg:col-span-12 flex flex-col border-t border-border">
            <div className="p-4 border-b border-border bg-card">
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">System Events</h2>
            </div>
            <div className="p-4">
              {events.length === 0 ? (
                <div className="text-muted-foreground text-xs font-mono">No events logged.</div>
              ) : (
                <div className="space-y-1">
                  {events.map((event) => (
                    <div key={event.id} className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-muted-foreground w-36 shrink-0">{formatDistanceToNow(new Date(event.createdAt))} ago</span>
                      <span className="text-foreground uppercase w-32 shrink-0">{event.type}</span>
                      <span className="text-muted-foreground truncate">{event.payload ? JSON.stringify(event.payload) : "--"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
