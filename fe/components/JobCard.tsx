"use client";

import Link from "next/link";
import type { Job, MemoryTier, GpuMemoryTier } from "@/types/api";
import StatusBadge from "./StatusBadge";
import { Button } from "./ui/button";
import { formatDistanceToNow } from "date-fns";
import { Terminal, Cpu, Database } from "lucide-react";

interface JobCardProps {
  job: Job;
  onStop?: (id: string) => void;
}

function formatMemoryTier(tier: MemoryTier): string {
  return tier.replace("gb", "") + "GB";
}

function formatGpuMemory(tier: GpuMemoryTier | null): string {
  if (!tier) return "--";
  return tier.replace("gb", "") + "GB";
}

export default function JobCard({ job, onStop }: JobCardProps) {
  const isTerminal = ["completed", "failed", "preempted", "cancelled", "rejected"].includes(job.status);
  const canStop = !isTerminal;

  return (
    <div className="flex flex-col border border-border bg-card transition-colors hover:border-primary/50 relative overflow-hidden group">
      {/* Decorative left accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-border group-hover:bg-primary transition-colors" />
      
      <div className="flex flex-col p-5 pl-6">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {job.type.replace('_', ' ')}
            </h3>
            <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
              ID: {job.id}
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs font-mono mb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cpu className="h-3 w-3" />
            <span className="text-foreground">{job.cpuTier}/{formatMemoryTier(job.memoryTier)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-[10px] uppercase">GPU:</span>
            <span className="text-primary">{formatGpuMemory(job.gpuMemoryTier)}</span>
          </div>
        </div>

        <div className="space-y-2 mb-4 flex-grow">
          <div className="bg-background border border-border p-2 rounded-none text-xs font-mono truncate text-muted-foreground">
            <span className="text-foreground">REPO:</span> {job.repoUrl}
          </div>
          {job.command && (
            <div className="bg-background border border-border p-2 rounded-none text-[10px] font-mono truncate text-muted-foreground flex items-center gap-2">
              <Terminal className="h-3 w-3" /> {job.command}
            </div>
          )}
          {job.kaggleDatasetUrl && (
            <div className="bg-background border border-border p-2 rounded-none text-[10px] font-mono truncate text-muted-foreground flex items-center gap-2">
              <Database className="h-3 w-3" /> DATASET_ATTACHED
            </div>
          )}
        </div>

        <div className="flex items-end justify-between mt-auto pt-4 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            T-{formatDistanceToNow(new Date(job.createdAt))}
          </div>
          <div className="flex space-x-2">
            <Link 
              href={`/jobs/${job.id}`}
              className="text-[10px] uppercase font-mono tracking-wider text-foreground hover:text-primary transition-colors px-3 py-1.5 border border-border bg-background hover:bg-card"
            >
              Inspect
            </Link>
            {canStop && onStop && (
              <button 
                onClick={() => onStop(job.id)}
                className="text-[10px] uppercase font-mono tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors px-3 py-1.5 border border-destructive/50"
              >
                Halt
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
