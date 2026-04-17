import { CpuTier, MemoryTier, GpuMemoryTier, DurationTier } from "@prisma/client";

const CPU_MAP: Record<string, number> = { light: 1, medium: 2, heavy: 4 };
const MEM_MAP: Record<string, number> = { gb8: 8192, gb16: 16384, gb32: 32768, gb64: 65536 };
const GPU_MEM_MAP: Record<string, number> = {
  gb8: 8192, gb12: 12288, gb16: 16384, gb24: 24576, gb32: 32768, gb48: 49152
};

export interface ReqInput {
  cpuTier: CpuTier | string;
  memoryTier: MemoryTier | string;
  gpuMemoryTier?: GpuMemoryTier | string | null;
  estimatedDuration?: DurationTier | string | null;
}

export interface EffectiveRequirements {
  minCpu: number;
  minRam: number; // raw
  minRamEffective: number; // after tolerance
  minGpuMem: number; // raw
  minGpuMemEffective: number; // after tolerance
  minTrustScore: number;
}

function envNum(name: string, fallback: number) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function computeEffectiveRequirements(input: ReqInput): EffectiveRequirements {
  const { cpuTier, memoryTier, gpuMemoryTier, estimatedDuration } = input;

  const rawMinCpu = CPU_MAP[String(cpuTier)] || 1;
  const rawMinRam = MEM_MAP[String(memoryTier)] || 8192;
  const rawMinGpu = gpuMemoryTier ? (GPU_MEM_MAP[String(gpuMemoryTier)] || 0) : 0;

  const trustMap: Record<string, number> = {
    lt1h: 20,
    h1_6: 60,
    h6_12: 80,
    h12_24: 80,
    gt24h: 90,
  };
  const minTrustScore = estimatedDuration ? (trustMap[String(estimatedDuration)] || 20) : 20;

  // tolerances (percentage under requested that is acceptable)
  const ramTolerance = envNum("JOB_MATCH_TOLERANCE_RAM_PERCENT", 0.10);
  const gpuTolerance = envNum("JOB_MATCH_TOLERANCE_GPU_PERCENT", 0.10);

  const minRamEffective = Math.round(rawMinRam * (1 - ramTolerance));
  const minGpuMemEffective = Math.round(rawMinGpu * (1 - gpuTolerance));

  return {
    minCpu: rawMinCpu,
    minRam: rawMinRam,
    minRamEffective,
    minGpuMem: rawMinGpu,
    minGpuMemEffective,
    minTrustScore: minTrustScore,
  };
}

export default computeEffectiveRequirements;
