import test from "node:test";
import assert from "node:assert/strict";
import { GpuVendor } from "@prisma/client";

import { parseGpuVendor } from "../src/lib/gpu";

test("real product names map to a vendor", () => {
  // The previous implementation took the first word, so this yielded
  // "geforce" and Postgres rejected the enum write.
  assert.equal(parseGpuVendor("GeForce RTX 4090"), GpuVendor.nvidia);
  assert.equal(parseGpuVendor("NVIDIA GeForce RTX 3080 Ti"), GpuVendor.nvidia);
  assert.equal(parseGpuVendor("Tesla T4"), GpuVendor.nvidia);
  assert.equal(parseGpuVendor("AMD Radeon RX 7900 XTX"), GpuVendor.amd);
  assert.equal(parseGpuVendor("Radeon Pro W6800"), GpuVendor.amd);
  assert.equal(parseGpuVendor("Intel Arc A770"), GpuVendor.intel);
});

test("unknown or malformed names yield null rather than a bad cast", () => {
  assert.equal(parseGpuVendor("Some Unknown Accelerator"), null);
  assert.equal(parseGpuVendor(undefined), null);
  assert.equal(parseGpuVendor(null), null);
  assert.equal(parseGpuVendor(42), null);
  assert.equal(parseGpuVendor(""), null);
});
