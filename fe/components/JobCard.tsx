"use client";

import Link from "next/link";
import type { Job } from "@/types/api";
import StatusBadge from "./StatusBadge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { formatDistanceToNow } from "date-fns";

interface JobCardProps {
  job: Job;
  onStop?: (id: string) => void;
}

export default function JobCard({ job, onStop }: JobCardProps) {
  const isTerminal = ["completed", "failed", "preempted", "cancelled", "rejected"].includes(job.status);
  const canStop = !isTerminal;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="capitalize">{job.type}</CardTitle>
            <CardDescription className="line-clamp-1">{job.repoUrl}</CardDescription>
          </div>
          <StatusBadge status={job.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">CPU:</span> {job.cpuRequired}
          </div>
          <div>
            <span className="text-muted-foreground">RAM:</span> {job.memoryRequired} MB
          </div>
          <div>
            <span className="text-muted-foreground">GPU:</span> {job.gpuRequired}
          </div>
          <div>
            <span className="text-muted-foreground">Timeout:</span> {Math.round(job.timeoutSeconds / 60)}h
          </div>
        </div>

        {job.notebookPath && (
          <p className="text-sm">
            <span className="text-muted-foreground">Notebook:</span> {job.notebookPath}
          </p>
        )}

        {job.command && (
          <p className="text-sm">
            <span className="text-muted-foreground">Command:</span>{" "}
            <code className="bg-muted px-1 rounded text-xs">{job.command}</code>
          </p>
        )}

        <div className="text-xs text-muted-foreground">
          Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm">
            {job.logsCount > 0 && (
              <span className="text-muted-foreground">{job.logsCount} log lines</span>
            )}
            {job.artifactsCount > 0 && (
              <span className="ml-3 text-muted-foreground">{job.artifactsCount} artifacts</span>
            )}
          </div>
          <div className="flex space-x-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/jobs/${job.id}`}>Details</Link>
            </Button>
            {canStop && onStop && (
              <Button size="sm" variant="destructive" onClick={() => onStop(job.id)}>
                Stop
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
