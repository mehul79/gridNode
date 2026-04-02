"use client";

import { useState, useEffect, useCallback } from "react";
import JobCard from "@/components/JobCard";
import JobCreateModal from "@/components/JobCreateModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import type { Job, JobType } from "@/types/api";

const JOB_STATUSES = [
  "draft", "pending_approval", "approved", "rejected", "queued", "assigned", "running", "completed", "failed", "preempted", "cancelled"
] as const;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      const query = params.toString();
      const url = `http://localhost:3005/api/jobs${query ? `?${query}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      const data = await res.json();
      setJobs(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleStop = async (jobId: string) => {
    if (!confirm("Are you sure you want to stop this job?")) return;
    try {
      const res = await fetch(`http://localhost:3005/api/jobs/${jobId}/stop`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to stop job");
      await fetchJobs(); // Refresh
      alert("Job stopped successfully");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCreateSuccess = () => {
    fetchJobs();
  };

  const filteredJobs = jobs; // already filtered by API

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Jobs</h1>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Job
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {JOB_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="notebook">Notebook</SelectItem>
            <SelectItem value="video">Video</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Jobs Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center text-destructive py-12">{error}</div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No jobs found. {statusFilter !== "all" || typeFilter !== "all" ? "Try adjusting filters." : "Create your first job!"}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} onStop={handleStop} />
          ))}
        </div>
      )}

      <JobCreateModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}
