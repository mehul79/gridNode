"use client";

import { useState, useEffect } from "react";
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
import { JobType } from "@/types/api";
import { Loader2 } from "lucide-react";

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
  const [cpuRequired, setCpuRequired] = useState(2);
  const [memoryRequired, setMemoryRequired] = useState(4096);
  const [gpuRequired, setGpuRequired] = useState(0);
  const [timeoutSeconds, setTimeoutSeconds] = useState(3600);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      // Reset form
      setType("notebook");
      setRepoUrl("");
      setNotebookPath("");
      setCommand("");
      setDatasetUri("");
      setCpuRequired(2);
      setMemoryRequired(4096);
      setGpuRequired(0);
      setTimeoutSeconds(3600);
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: any = {
        type,
        repoUrl,
        cpuRequired,
        memoryRequired,
        gpuRequired,
        timeoutSeconds,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Job</DialogTitle>
          <DialogDescription>
            Submit a compute job for ML notebook training or video processing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          {/* Job Type */}
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

          {/* Repo URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Repository URL *</label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo"
              required
            />
          </div>

          {/* Notebook Path or Command */}
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

          {/* Dataset URI */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Dataset URI (Optional)</label>
            <Input
              value={datasetUri}
              onChange={(e) => setDatasetUri(e.target.value)}
              placeholder="s3://bucket/dataset or /path/to/data"
            />
          </div>

          {/* Resources */}
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
              <label className="text-sm font-medium">Memory (MB) *</label>
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
              Job will be automatically stopped after this duration (default: 3600 = 1 hour)
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
