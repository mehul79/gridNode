"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Briefcase, CheckSquare, Monitor, Plus } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();
  const [stats, setStats] = useState<{ jobs: number; pendingApprovals: number; machines: number }>({ jobs: 0, pendingApprovals: 0, machines: 0 });
  const [role, setRole] = useState<string>("requester");
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      // Fetch full user data (including role) from backend
      const fetchUser = async () => {
        try {
          const res = await fetch("http://localhost:3005/api/check/me", { credentials: "include" });
          if (res.ok) {
            const user = await res.json();
            setRole(user.role || "requester");
          }
        } catch (e) {
          console.error("Failed to fetch user role", e);
        }
      };
      fetchUser();
      fetchJobs();
    }
  }, [session]);

  const fetchJobs = async () => {
    try {
      const res = await fetch("http://localhost:3005/api/jobs", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (e) {
      console.error("Failed to fetch jobs", e);
    }
  };

  const pendingApprovalsCount = jobs.filter((j) => j.status === "pending_approval").length;

  // Dev-only: set role
  const devSetRole = async (newRole: "owner" | "requester") => {
    try {
      await fetch(`http://localhost:3005/api/dev/set-role?role=${newRole}`, {
        method: "POST",
        credentials: "include",
      });
      // Reload to update session
      window.location.reload();
    } catch (e) {
      alert("Failed to switch role (dev only)");
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {session.user.name}
            <Badge variant="outline" className="ml-2 capitalize">{role}</Badge>
          </p>
        </div>
        {/* Dev-only role switcher */}
        {process.env.NODE_ENV === "development" && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Dev role:</span>
            <Button size="sm" variant="outline" onClick={() => devSetRole("requester")}>Requester</Button>
            <Button size="sm" variant="outline" onClick={() => devSetRole("owner")}>Owner</Button>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingApprovalsCount}</div>
            <p className="text-xs text-muted-foreground">
              {role === "owner" || role === "admin" ? "Requires your action" : "Waiting for owner"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Registered Machines</CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">View in Machines page</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col space-y-2">
            <Button asChild className="w-full">
              <Link href="/jobs">
                <Plus className="mr-2 h-4 w-4" /> Create Job
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/jobs">View All Jobs</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs */}
      <div>
        <h2 className="text-2xl font-bold mb-4">Recent Jobs</h2>
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No jobs yet. Create your first job!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {jobs.slice(0, 6).map((job) => (
              <Card key={job.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base capitalize">{job.type}</CardTitle>
                    <Badge variant={
                      job.status === "pending_approval" ? "warning" :
                      job.status === "approved" ? "success" :
                      job.status === "rejected" ? "destructive" :
                      job.status === "running" ? "info" :
                      "outline"
                    }>
                      {job.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <CardDescription className="truncate">{job.repoUrl}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
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
                  <Button asChild variant="secondary" size="sm" className="w-full mt-4">
                    <Link href={`/jobs/${job.id}`}>View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        {jobs.length > 6 && (
          <div className="mt-4 text-center">
            <Button asChild variant="outline">
              <Link href="/jobs">View All Jobs</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
