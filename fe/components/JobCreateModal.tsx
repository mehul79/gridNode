"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { JobType, Machine, CpuIntensity, GpuVendor } from "@/types/api";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

interface JobCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function JobCreateModal({ open, onOpenChange, onSuccess }: JobCreateModalProps) {
  const [type, setType] = useState<JobType>("notebook");
  const [repoUrl, setRepoUrl] = useState("");
  const [notebookPath, setNotebookPath] = useState("");
  const [command, setCommand] = useState("");
  const [datasetUri, setDatasetUri] = useState("");
  const [kaggleDatasetUrl, setKaggleDatasetUrl] = useState("");

  // Resource requirements
  const [cpuRequired, setCpuRequired] = useState(2);
  const [memoryRequired, setMemoryRequired] = useState(4096);
  const [gpuRequired, setGpuRequired] = useState(0);
  const [gpuMemoryRequired, setGpuMemoryRequired] = useState<number>(0);
  const [gpuVendor, setGpuVendor] = useState<GpuVendor | "">("");
  const [cpuIntensity, setCpuIntensity] = useState<CpuIntensity | "">("");
  const [estimatedDuration, setEstimatedDuration] = useState<number | "">("");

  const [timeoutSeconds, setTimeoutSeconds] = useState(3600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(true);
  const [selectedMachineId, setSelectedMachineId] = useState<string>("");

  // Compute compatible machines count
  const compatibleCount = useMemo(() => {
    return machines.filter(machine => {
      // Basic resource check
      if (machine.cpuTotal < cpuRequired) return false;
      if (machine.memoryTotal < memoryRequired) return false;
      if (machine.gpuTotal < gpuRequired) return false;

      // GPU memory check (per GPU): machine total GPU memory divided by GPU count should be >= required (if single GPU job)
      if (gpuRequired > 0 && gpuMemoryRequired > 0) {
        if (machine.gpuTotal <= 0) return false;
        const memoryPerGpu = machine.gpuMemoryTotal ? Math.floor(machine.gpuMemoryTotal / machine.gpuTotal) : 0;
        if (memoryPerGpu < gpuMemoryRequired) return false;
      }

      // GPU vendor check: soft preference - if job specifies vendor, machine should match or be "other"
      if (gpuRequired > 0 && gpuVendor && machine.gpuVendor) {
        if (machine.gpuVendor !== gpuVendor && machine.gpuVendor !== "other") {
          return false;
        }
      }

      return true;
    }).length;
  }, [machines, cpuRequired, memoryRequired, gpuRequired, gpuMemoryRequired, gpuVendor]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open]);

  const resetForm = () => {
    setType("notebook");
    setRepoUrl("");
    setNotebookPath("");
    setCommand("");
    setDatasetUri("");
    setKaggleDatasetUrl("");
    setCpuRequired(2);
    setMemoryRequired(4096);
    setGpuRequired(0);
    setGpuMemoryRequired(0);
    setGpuVendor("");
    setCpuIntensity("");
    setEstimatedDuration("");
    setTimeoutSeconds(3600);
    setError(null);
    setSelectedMachineId("");
    setMachines([]);
  };

  useEffect(() => {
    if (open) {
      fetchMachines();
    }
  }, [open]);

  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const res = await fetch("http://localhost:3005/api/machines?all=true", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMachines(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMachines(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!selectedMachineId) {
      setError("Please select a target machine");
      setLoading(false);
      return;
    }

    // Validation
    if (gpuRequired > 0) {
      if (!gpuVendor) {
        setError("GPU vendor is required when GPU count > 0");
        setLoading(false);
        return;
      }
      if (!gpuMemoryRequired || gpuMemoryRequired < 1024) {
        setError("GPU memory (MB) is required and must be at least 1024 when GPU is selected");
        setLoading(false);
        return;
      }
    }

    try {
      const body: any = {
        type,
        repoUrl,
        cpuRequired,
        memoryRequired,
        gpuRequired,
        timeoutSeconds,
        machineId: selectedMachineId,
        gpuMemoryRequired: gpuRequired > 0 ? gpuMemoryRequired : null,
        gpuVendor: gpuRequired > 0 ? gpuVendor : null,
        cpuIntensity: cpuIntensity || null,
        estimatedDuration: estimatedDuration !== "" ? Number(estimatedDuration) : null,
        kaggleDatasetUrl: kaggleDatasetUrl.trim() || null,
      };

      if (type === "notebook") {
        if (!notebookPath.trim()) throw new Error("Notebook path is required");
        body.notebookPath = notebookPath.trim();
      } else if (type === "video") {
        if (!command.trim()) throw new Error("Command is required for video jobs");
        body.command = command.trim();
      }

      if (datasetUri.trim()) {
        body.datasetUri = datasetUri.trim();
      }

      const res = await fetch("http://localhost:3005/api/jobs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create job");
      }

      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isGpuEnabled = gpuRequired > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Submit a compute job for ML notebook training or video processing.
            Specify your resource requirements and execution details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-4">
          {/* Job Type & Repository */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Job Type</label>
              <Select value={type} onValueChange={(v) => setType(v as JobType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="notebook">Notebook (ML Training)</SelectItem>
                  <SelectItem value="video">Video (FFmpeg)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Repository URL *</label>
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                required
              />
            </div>
          </div>

          {/* Resource Requirements */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-medium text-sm">Resource Requirements</h3>

            {/* Basic Resources */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">CPU Cores *</label>
                <Input
                  type="number"
                  min={1}
                  value={cpuRequired}
                  onChange={(e) => setCpuRequired(parseInt(e.target.value) || 1)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum RAM (MB) *</label>
                <Input
                  type="number"
                  min={128}
                  step={128}
                  value={memoryRequired}
                  onChange={(e) => setMemoryRequired(parseInt(e.target.value) || 4096)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">GPU Count</label>
                <Input
                  type="number"
                  min={0}
                  value={gpuRequired}
                  onChange={(e) => setGpuRequired(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* GPU-specific fields */}
            {isGpuEnabled && (
              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">GPU Vendor *</label>
                  <Select value={gpuVendor} onValueChange={(v) => setGpuVendor(v as GpuVendor)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nvidia">NVIDIA</SelectItem>
                      <SelectItem value="amd">AMD</SelectItem>
                      <SelectItem value="intel">Intel</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">GPU Memory Required (MB) *</label>
                  <Input
                    type="number"
                    min={1024}
                    step={1024}
                    value={gpuMemoryRequired}
                    onChange={(e) => setGpuMemoryRequired(parseInt(e.target.value) || 0)}
                    placeholder="e.g., 16384 for 16GB"
                  />
                  <p className="text-xs text-muted-foreground">
                    Memory needed per GPU (since 1 GPU per job)
                  </p>
                </div>
              </div>
            )}

            {/* CPU Intensity & Duration */}
            <div className="border-t pt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">CPU Intensity</label>
                <Select value={cpuIntensity} onValueChange={(v) => setCpuIntensity(v as CpuIntensity)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select intensity (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Estimated Duration (hours)</label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={estimatedDuration}
                  onChange={(e) => setEstimatedDuration(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  placeholder="e.g., 2.5"
                />
              </div>
            </div>

            {/* Machine Compatibility Info */}
            {machines.length > 0 && (
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 text-sm">
                  {compatibleCount > 0 ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">
                        {compatibleCount} machine{compatibleCount !== 1 ? "s" : ""} compatible with these requirements
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-orange-500" />
                      <span className="text-orange-600 dark:text-orange-400">
                        No machines fully compatible. You can still select any machine but it may not meet all requirements.
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Execution Details */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Execution Details</h3>

            {type === "notebook" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Notebook Path *</label>
                <Input
                  value={notebookPath}
                  onChange={(e) => setNotebookPath(e.target.value)}
                  placeholder="notebooks/train.ipynb"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Path to the notebook file within the repository
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Command *</label>
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="ffmpeg -i input.mp4 output.mp4"
                  rows={3}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  FFmpeg command to execute (will run inside Docker container)
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Dataset URI (Optional)</label>
              <Input
                value={datasetUri}
                onChange={(e) => setDatasetUri(e.target.value)}
                placeholder="s3://bucket/dataset or /path/to/data"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Kaggle Dataset URL (Optional)</label>
              <Input
                value={kaggleDatasetUrl}
                onChange={(e) => setKaggleDatasetUrl(e.target.value)}
                placeholder="https://www.kaggle.com/datasets/..."
              />
              <p className="text-xs text-muted-foreground">
                Direct link to a Kaggle dataset. Will be accessible during job execution.
              </p>
            </div>
          </div>

          {/* Target Machine Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Machine *</label>
            {loadingMachines ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading machines...</span>
              </div>
            ) : machines.length === 0 ? (
              <p className="text-sm text-destructive">
                No machines available. Please register a machine first.
              </p>
            ) : (
              <>
                <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((machine) => {
                      // Determine compatibility for this machine
                      const isCompatible = machine.cpuTotal >= cpuRequired &&
                        machine.memoryTotal >= memoryRequired &&
                        machine.gpuTotal >= gpuRequired;
                      const gpuMemoryOk = gpuRequired > 0 && gpuMemoryRequired > 0
                        ? machine.gpuTotal > 0 && machine.gpuMemoryTotal ? Math.floor(machine.gpuMemoryTotal / machine.gpuTotal) >= gpuMemoryRequired : false
                        : true;
                      const vendorOk = gpuRequired > 0 && gpuVendor && machine.gpuVendor
                        ? machine.gpuVendor === gpuVendor || machine.gpuVendor === "other"
                        : true;
                      const fullyCompatible = isCompatible && gpuMemoryOk && vendorOk;

                      return (
                        <SelectItem key={machine.id} value={machine.id}>
                          <div className="flex items-center justify-between w-full">
                            <span>
                              {machine.id.slice(0, 8)}... - CPU: {machine.cpuTotal} • RAM: {machine.memoryTotal}MB • GPU: {machine.gpuTotal}
                              {machine.gpuTotal > 0 && machine.gpuVendor && (
                                <span> ({machine.gpuVendor}, {machine.gpuMemoryTotal}MB total)</span>
                              )}
                            </span>
                            {fullyCompatible ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 ml-2" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-orange-500 ml-2" />
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the machine that will run this job. The machine owner will approve the job.
                  {compatibleCount === 0 && machines.length > 0 && " Some machines may not meet all requirements."}
                </p>
              </>
            )}
          </div>

          {/* Timeout */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Timeout (seconds)</label>
            <Input
              type="number"
              min={60}
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(parseInt(e.target.value) || 3600)}
            />
            <p className="text-xs text-muted-foreground">
              Job will be automatically stopped after this duration (default: 3600 = 1 hour).
              {estimatedDuration && " Based on estimated duration, consider setting timeout higher."}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Job
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
