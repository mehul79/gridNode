import test from "node:test";
import assert from "node:assert/strict";
import { JobStatus } from "@prisma/client";

import { canTransition, canStop, isTerminalStatus } from "../src/lib/jobStatus";

test("terminal statuses are recognised", () => {
  for (const s of [
    JobStatus.completed,
    JobStatus.failed,
    JobStatus.preempted,
    JobStatus.cancelled,
    JobStatus.rejected,
  ]) {
    assert.equal(isTerminalStatus(s), true, `${s} should be terminal`);
  }
  for (const s of [JobStatus.queued, JobStatus.assigned, JobStatus.running]) {
    assert.equal(isTerminalStatus(s), false, `${s} should not be terminal`);
  }
});

test("the happy path through the lifecycle is legal", () => {
  const path: JobStatus[] = [
    JobStatus.pending_approval,
    JobStatus.approved,
    JobStatus.queued,
    JobStatus.assigned,
    JobStatus.running,
    JobStatus.completed,
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.equal(
      canTransition(path[i]!, path[i + 1]!),
      true,
      `${path[i]} -> ${path[i + 1]} should be allowed`
    );
  }
});

test("an agent may defer an assigned job back to the queue", () => {
  // agent.py reports `queued` when the job is not viable on this machine
  assert.equal(canTransition(JobStatus.assigned, JobStatus.queued), true);
});

test("a job cannot jump straight to completed", () => {
  assert.equal(canTransition(JobStatus.pending_approval, JobStatus.completed), false);
  assert.equal(canTransition(JobStatus.approved, JobStatus.completed), false);
  assert.equal(canTransition(JobStatus.queued, JobStatus.completed), false);
  assert.equal(canTransition(JobStatus.assigned, JobStatus.completed), false);
});

test("approval decisions cannot be re-made once decided", () => {
  assert.equal(canTransition(JobStatus.approved, JobStatus.rejected), false);
  assert.equal(canTransition(JobStatus.rejected, JobStatus.approved), false);
});

test("stop and preempt are reachable from any non-terminal status", () => {
  for (const s of [
    JobStatus.pending_approval,
    JobStatus.approved,
    JobStatus.queued,
    JobStatus.assigned,
    JobStatus.running,
  ]) {
    assert.equal(canTransition(s, JobStatus.cancelled), true);
    assert.equal(canTransition(s, JobStatus.preempted), true);
    assert.equal(canStop(s), true);
  }
});

test("a terminal job cannot be stopped or moved on", () => {
  assert.equal(canStop(JobStatus.completed), false);
  assert.equal(canTransition(JobStatus.completed, JobStatus.cancelled), false);
  assert.equal(canTransition(JobStatus.failed, JobStatus.running), false);
});
