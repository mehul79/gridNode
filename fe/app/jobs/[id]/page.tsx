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
import { Loader2, ArrowLeft, Download, Square } from "lucide-react";
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Jobs
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Job Details</h1>
          <div className="flex items-center space-x-4">
            <Badge variant="outline" className="capitalize">
              {job.type}
            </Badge>
            <StatusBadge status={job.status} />
          </div>
        </div>
        {canStop && (
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={stopping}
          >
            {stopping && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Square className="mr-2 h-4 w-4" />
            Stop Job
          </Button>
        )}
      </div>

      {/* Job Info */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Job Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-medium">Repository:</span>{" "}
              <a
                href={job.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {job.repoUrl}
              </a>
            </div>

            {job.command && (
              <div>
                <span className="font-medium">Command:</span>
                <code className="ml-2 bg-muted px-2 py-1 rounded text-sm">
                  {job.command}
                </code>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <span className="font-medium">Resources:</span>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  <li>CPU: {formatCpuTier(job.cpuTier)}</li>
                  <li>Memory: {formatMemoryTier(job.memoryTier)}</li>
                  <li>
                    GPU: {formatGpuMemory(job.gpuMemoryTier)}
                    {job.gpuVendor && job.gpuMemoryTier && (
                      <span> ({job.gpuVendor})</span>
                    )}
                  </li>
                </ul>
              </div>
              <div>
                <span className="font-medium">Time Estimates:</span>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {job.estimatedDuration && (
                    <li>
                      Estimated Duration:{" "}
                      {formatDurationTier(job.estimatedDuration)}
                    </li>
                  )}
                </ul>
              </div>
            </div>

            {job.kaggleDatasetUrl && (
              <div className="pt-2 border-t">
                <span className="font-medium">Kaggle Dataset:</span>{" "}
                <a
                  href={job.kaggleDatasetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {job.kaggleDatasetUrl}
                </a>
              </div>
            )}

            <div className="text-sm text-muted-foreground pt-2 border-t">
              <div>
                Created:{" "}
                {formatDistanceToNow(new Date(job.createdAt), {
                  addSuffix: true,
                })}
              </div>
              <div>
                Updated:{" "}
                {formatDistanceToNow(new Date(job.updatedAt), {
                  addSuffix: true,
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Live Logs</CardTitle>
            <CardDescription>
              Real-time stream (Socket:{" "}
              {isConnected ? (
                <span className="text-green-500">connected</span>
              ) : (
                <span className="text-red-500">disconnected</span>
              )}
              )
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchLogs(0)}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {logsError && (
            <div className="flex items-center justify-between gap-3 p-3 mb-4 rounded-md border border-destructive/20 bg-destructive/10 text-destructive text-sm">
              <span>{logsError}</span>
              <Button size="sm" variant="outline" className="h-8 bg-background hover:bg-muted font-medium border-destructive/20 hover:text-destructive hover:bg-destructive/5" onClick={() => fetchLogs()}>
                Retry
              </Button>
            </div>
          )}
          <div className="log-viewer">
            {logs.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No logs yet. Agent will stream logs here.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`log-line ${log.stream || ""}`}>
                  <span className="text-xs text-muted-foreground mr-2">
                    [{log.sequence} {log.stream || "stdout"}]
                  </span>
                  {log.line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Artifacts */}
      <Card>
        <CardHeader>
          <CardTitle>Artifacts</CardTitle>
          <CardDescription>
            Output files registered by the agent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {artifactsError && (
            <div className="flex items-center justify-between gap-3 p-3 mb-4 rounded-md border border-destructive/20 bg-destructive/10 text-destructive text-sm">
              <span>{artifactsError}</span>
              <Button size="sm" variant="outline" className="h-8 bg-background hover:bg-muted font-medium border-destructive/20 hover:text-destructive hover:bg-destructive/5" onClick={() => fetchArtifacts()}>
                Retry
              </Button>
            </div>
          )}
          {artifacts.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No artifacts yet
            </div>
          ) : (
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border"
                >
                  <div className="min-w-0">
                    <div className="font-medium break-all">{artifact.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {artifact.mimeType && `${artifact.mimeType} • `}
                      {artifact.sizeBytes
                        ? `${(artifact.sizeBytes / 1024).toFixed(1)} KB`
                        : "Size unknown"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={downloadingArtifactId === artifact.id}
                    onClick={() => downloadArtifact(artifact)}
                  >
                    {downloadingArtifactId === artifact.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Download
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Job Events</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-muted-foreground text-sm">No events</div>
          ) : (
            <div className="space-y-3">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="text-sm border-b pb-2 last:border-0"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{ev.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(ev.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  {ev.payload && (
                    <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
