import test from "node:test";
import assert from "node:assert/strict";
import { IsolationMode } from "@prisma/client";

import { parseIsolationMode } from "../src/lib/isolation";

test("the modes an agent reports map onto the enum", () => {
  assert.equal(parseIsolationMode("gvisor"), IsolationMode.gvisor);
  assert.equal(parseIsolationMode("runc"), IsolationMode.runc);
});

test("the runtime's own name is accepted as an alias for gvisor", () => {
  // docker reports the runtime as "runsc"; the agent may send either.
  assert.equal(parseIsolationMode("runsc"), IsolationMode.gvisor);
  assert.equal(parseIsolationMode("  RunSC "), IsolationMode.gvisor);
});

test("anything unrecognised becomes null rather than a bad enum cast", () => {
  // Agents are untrusted input: an unknown enum member makes Postgres reject
  // the whole registration or heartbeat.
  for (const bad of ["kata", "", "  ", undefined, null, 7, {}, ["runc"]]) {
    assert.equal(parseIsolationMode(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});
