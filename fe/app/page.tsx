"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Plus, Terminal, Activity, ArrowRight, Server, Cpu } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import StatusBadge from "@/components/StatusBadge";
import type { Job, MemoryTier, GpuMemoryTier, DurationTier } from "@/types/api";

function formatMemoryTier(tier: MemoryTier): string {
  return tier.replace("gb", "") + "GB";
}

function formatGpuMemory(tier: GpuMemoryTier | null): string {
  if (!tier) return "--";
  return tier.replace("gb", "") + "GB";
}

export default function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      fetchJobs();
    }
  }, [session]);

  async function fetchJobs() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/jobs`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (e) {
      console.error("Failed to fetch jobs", e);
    }
  };

  const activeJobs = jobs.filter(j => !['completed', 'failed', 'cancelled', 'rejected'].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'completed');

  if (isPending) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">GridNode Console</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            USER_ID: {session.user.id.substring(0, 8)} | SESSION_ACTIVE
          </p>
        </div>
        <Link 
          href="/jobs"
          className="flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span>NEW_JOB</span>
        </Link>
      </div>

      <div className="border border-border">
        <div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-12">
          
          {/* NETWORK PULSE PANEL */}
          <div className="col-span-1 bg-background p-6 lg:col-span-3 flex flex-col gap-6">
            <div>
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                <Activity className="h-4 w-4" /> Network Pulse
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <span className="font-mono text-3xl font-light">{jobs.length}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">Total Jobs</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-3xl font-light text-primary">{activeJobs.length}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">Active</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-xl font-light text-muted-foreground">{completedJobs.length}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">Completed</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-mono text-xl font-light text-warning">
                    {jobs.filter(j => j.status === 'failed' || j.status === 'preempted').length}
                  </span>
                  <span className="text-[10px] uppercase text-muted-foreground">Failed/Intr</span>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-border">
              <h3 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Provider Tools</h3>
              <Link href="/machines" className="group flex items-center justify-between border border-border p-3 hover:bg-card transition-colors">
                <div className="flex items-center gap-3">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-mono uppercase">Manage Nodes</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            </div>
          </div>

          {/* ACTIVE JOBS LIST */}
          <div className="col-span-1 bg-background lg:col-span-9 flex flex-col">
            <div className="flex items-center justify-between border-b border-border p-4 bg-card">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <Terminal className="h-4 w-4" /> Job Queue
              </h2>
              <Link href="/jobs" className="text-[10px] font-mono text-primary uppercase hover:underline">
                View_All -&gt;
              </Link>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm font-mono border-collapse">
                <thead className="bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Job_ID</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Resources</th>
                    <th className="px-4 py-3 font-medium">Age</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No jobs currently tracked.
                      </td>
                    </tr>
                  ) : (
                    jobs.slice(0, 8).map((job) => (
                      <tr key={job.id} className="hover:bg-card transition-colors group">
                        <td className="px-4 py-3 text-muted-foreground">
                          <Link href={`/jobs/${job.id}`} className="hover:text-primary transition-colors">
                            {job.id.substring(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="px-4 py-3 uppercase text-xs">
                          {job.type.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
                          <Cpu className="h-3 w-3" />
                          <span>{job.cpuTier}/{formatMemoryTier(job.memoryTier)}</span>
                          {job.gpuMemoryTier && (
                            <span className="text-primary border border-primary/20 px-1 rounded-sm">
                              GPU:{formatGpuMemory(job.gpuMemoryTier)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(job.createdAt))}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/jobs/${job.id}`} className="text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-primary transition-colors">
                            Inspect
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
