import test from "node:test";
import assert from "node:assert/strict";

import computeEffectiveRequirements from "../src/lib/matchCriteria";

test("tiers map to concrete minima", () => {
  const eff = computeEffectiveRequirements({ cpuTier: "medium", memoryTier: "gb16" });
  assert.equal(eff.minCpu, 4);
  assert.equal(eff.minRam, 16384);
});

test("effective RAM applies the 10% default tolerance", () => {
  const eff = computeEffectiveRequirements({ cpuTier: "light", memoryTier: "gb8" });
  assert.equal(eff.minRam, 8192);
  assert.equal(eff.minRamEffective, Math.round(8192 * 0.9));
  assert.ok(eff.minRamEffective < eff.minRam);
});

test("GPU minima are zero when no GPU tier is requested", () => {
  const eff = computeEffectiveRequirements({ cpuTier: "light", memoryTier: "gb8" });
  assert.equal(eff.minGpuMem, 0);
  assert.equal(eff.minGpuMemEffective, 0);
});

test("longer jobs demand a higher trust score", () => {
  const short = computeEffectiveRequirements({
    cpuTier: "light",
    memoryTier: "gb8",
    estimatedDuration: "lt1h",
  });
  const long = computeEffectiveRequirements({
    cpuTier: "light",
    memoryTier: "gb8",
    estimatedDuration: "gt24h",
  });
  assert.equal(short.minTrustScore, 20);
  assert.equal(long.minTrustScore, 90);
  assert.ok(long.minTrustScore > short.minTrustScore);
});

test("unknown tiers fall back to safe defaults instead of NaN", () => {
  const eff = computeEffectiveRequirements({ cpuTier: "bogus", memoryTier: "bogus" });
  assert.equal(eff.minCpu, 1);
  assert.equal(eff.minRam, 8192);
  assert.ok(Number.isFinite(eff.minRamEffective));
});
