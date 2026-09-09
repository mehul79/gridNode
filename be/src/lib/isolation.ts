import { IsolationMode } from "@prisma/client";

/**
 * Maps the sandbox mode an agent reports onto the IsolationMode enum.
 *
 * Agents are untrusted input, so an unrecognised value becomes null rather than
 * being cast into the enum — Postgres rejects an unknown enum member and the
 * whole registration or heartbeat would fail.
 */
export function parseIsolationMode(value: unknown): IsolationMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "gvisor" || normalized === "runsc") return IsolationMode.gvisor;
  if (normalized === "runc") return IsolationMode.runc;
  return null;
}
