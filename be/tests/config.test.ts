import test from "node:test";
import assert from "node:assert/strict";

import { allowedOrigins } from "../src/lib/config";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("development falls back to the localhost origins", () => {
  withEnv({ NODE_ENV: "development", FRONTEND_URL: undefined, ALLOWED_ORIGINS: undefined }, () => {
    assert.deepEqual(allowedOrigins(), ["http://localhost:3000", "http://localhost:8000"]);
  });
});

test("production trusts only what the environment declares", () => {
  withEnv(
    { NODE_ENV: "production", FRONTEND_URL: "https://grid.example.com", ALLOWED_ORIGINS: undefined },
    () => {
      const origins = allowedOrigins();
      assert.deepEqual(origins, ["https://grid.example.com"]);
      assert.ok(!origins.some((o) => o.includes("localhost")));
    }
  );
});

test("extra origins are merged and de-duplicated", () => {
  withEnv(
    {
      NODE_ENV: "production",
      FRONTEND_URL: "https://grid.example.com",
      ALLOWED_ORIGINS: "https://admin.example.com, https://grid.example.com",
    },
    () => {
      assert.deepEqual(allowedOrigins(), [
        "https://grid.example.com",
        "https://admin.example.com",
      ]);
    }
  );
});
