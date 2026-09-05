import { GpuVendor } from "@prisma/client";

/**
 * Maps a reported GPU product name (e.g. "NVIDIA GeForce RTX 4090") to the
 * GpuVendor enum. Returns null when the vendor cannot be determined — callers
 * must persist null rather than an unchecked cast, which Postgres rejects.
 */
export function parseGpuVendor(name: unknown): GpuVendor | null {
  if (typeof name !== "string") return null;
  const lower = name.toLowerCase();
  if (lower.includes("nvidia") || lower.includes("geforce") || lower.includes("quadro") || lower.includes("tesla")) {
    return GpuVendor.nvidia;
  }
  if (lower.includes("amd") || lower.includes("radeon")) return GpuVendor.amd;
  if (lower.includes("intel") || lower.includes("arc")) return GpuVendor.intel;
  return null;
}
