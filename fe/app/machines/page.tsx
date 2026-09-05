"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Monitor, Copy, Check, Power, Key, Terminal } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Machine } from "@/types/api";
import { TrustMeter } from "@/components/TrustMeter";

import StatusBadge from "@/components/StatusBadge";

interface MachineStatusBadgeProps {
  lastHeartbeatAt: string | null;
  status: string;
}

function MachineStatusBadge({ lastHeartbeatAt, status }: MachineStatusBadgeProps) {
  const isRecent = lastHeartbeatAt && new Date(lastHeartbeatAt) > new Date(Date.now() - 3 * 60 * 1000);
  
  if (status === "offline" || (!isRecent && lastHeartbeatAt)) {
    return <StatusBadge status="offline" />;
  }

  if (status === "running") {
    return <StatusBadge status="running" />;
  }

  return <StatusBadge status="idle" />;
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [userKey, setUserKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reclaiming, setReclaiming] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/machines`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch machines");
      const data = await res.json();
      setMachines(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/check/me`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUserKey(data.userKey);
      }
    } catch (e) {
      console.error("Failed to fetch user", e);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
    fetchUser();
  }, [fetchMachines, fetchUser]);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/check/user-key`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate user key");
      const data = await res.json();
      setUserKey(data.userKey);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleCopyToken = async () => {
    if (userKey) {
      await navigator.clipboard.writeText(userKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReclaim = async (machineId: string) => {
    if (!confirm("Reclaim this machine? All running jobs on this machine will be preempted.")) return;
    setReclaiming(machineId);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"}/api/machines/${machineId}/reclaim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reclaim machine");
      await fetchMachines();
      alert("Machine reclaimed, jobs preempted");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setReclaiming(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold uppercase tracking-wider text-foreground">Infrastructure Nodes</h1>
        <p className="text-[10px] font-mono text-muted-foreground uppercase mt-1">Manage compute resources and agent authentication keys</p>
      </div>

      {/* Agent Key Section */}
      <div className="border border-border bg-card flex flex-col">
        <div className="p-4 border-b border-border bg-background flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            <Key className="h-3 w-3" /> Agent Registration Key
          </h2>
        </div>
        <div className="p-6">
          {userKey ? (
            <div className="space-y-4 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground uppercase text-[10px]">Your Personal Agent Key:</span>
                <button 
                  type="button" 
                  className="flex items-center gap-2 text-primary hover:bg-primary/10 px-3 py-1 border border-primary/50 transition-colors uppercase text-[10px]"
                  onClick={handleCopyToken}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "COPIED" : "COPY_KEY"}
                </button>
              </div>
              <div className="bg-background border border-border p-4 break-all text-muted-foreground">
                {userKey}
              </div>
              <p className="text-muted-foreground text-[10px] uppercase flex items-center gap-2">
                <Terminal className="h-3 w-3" /> 
                Launch Command: 
                <span className="text-foreground">$ computeshare-agent start --token {userKey}</span>
              </p>
              
              <div className="pt-4 border-t border-border flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
                Need a new key? 
                <button onClick={handleRegister} className="text-primary hover:underline uppercase">Regenerate</button> 
                (Existing machines remain valid)
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[10px] font-mono uppercase text-muted-foreground mb-4">You haven&apos;t generated an agent key yet.</p>
              <button 
                onClick={handleRegister} 
                disabled={registering}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 font-mono text-xs uppercase hover:opacity-90 transition-opacity"
              >
                {registering && <Loader2 className="h-3 w-3 animate-spin" />}
                Generate_Key
              </button>
            </div>
          )}
          {error && <p className="text-[10px] font-mono text-destructive uppercase mt-4">ERR: {error}</p>}
        </div>
      </div>

      {/* Machines List */}
      <div>
        <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-4">Registered Hardware Nodes</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : machines.length === 0 ? (
          <div className="border border-border bg-card p-12 text-center text-[10px] font-mono uppercase text-muted-foreground">
            No active nodes. Deploy the agent to connect hardware.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {machines.map((machine) => (
              <div key={machine.id} className="flex flex-col border border-border bg-card hover:border-primary/50 transition-colors">
                <div className="p-4 border-b border-border flex items-center justify-between bg-background">
                  <div className="flex items-center gap-2 text-xs font-mono uppercase text-foreground">
                    <Monitor className="h-4 w-4" />
                    NODE_{machine.id.substring(0,6)}
                  </div>
                  <MachineStatusBadge lastHeartbeatAt={machine.lastHeartbeatAt} status={machine.status} />
                </div>
                
                <div className="p-4 space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase text-muted-foreground mb-1">Compute</div>
                      <div className="text-foreground">
                        {machine.cpuTotal} CORE<br/>
                        {Math.round(machine.memoryTotal / 1024)} GB RAM
                      </div>
                    </div>
                    {machine.gpuTotal > 0 && machine.gpuVendor && (
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground mb-1">Accelerator</div>
                        <div className="text-foreground text-[10px]">
                          {machine.gpuVendor.toUpperCase()}<br/>
                          {Math.round((machine.gpuMemoryTotal || 0) / 1024)} GB VRAM
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-3 border-t border-border">
                    <TrustMeter score={machine.trustScore} className="mt-1" />
                  </div>

                  <div className="pt-3 border-t border-border flex flex-col gap-1 text-[10px] uppercase text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Jobs (Success/Fail)</span>
                      <span className="text-foreground">{machine.totalJobsCompleted} / {machine.totalJobsFailed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Seen</span>
                      <span className="text-foreground">
                        {machine.lastHeartbeatAt ? formatDistanceToNow(new Date(machine.lastHeartbeatAt), { addSuffix: true }) : 'NEVER'}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto border-t border-border">
                  <button
                    onClick={() => handleReclaim(machine.id)}
                    disabled={reclaiming === machine.id}
                    className="w-full py-2 flex justify-center items-center gap-2 text-[10px] uppercase font-mono tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    {reclaiming === machine.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    [ Reclaim_Node ]
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
