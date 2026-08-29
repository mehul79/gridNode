const assert = require("assert");

// This function mimics the logic inside MachineStatusBadge in fe/app/machines/page.tsx
function getMachineBadgeStatus(status, lastHeartbeatAt, mockNow) {
  // If status is offline, return Offline immediately
  if (status === "offline") {
    return "Offline";
  }

  // Check if lastHeartbeatAt is recent (within 3 minutes)
  const threeMinutes = 3 * 60 * 1000;
  const lastHeartbeatTime = lastHeartbeatAt ? new Date(lastHeartbeatAt).getTime() : 0;
  const isRecent = lastHeartbeatTime && lastHeartbeatTime > (mockNow - threeMinutes);
  
  if (!isRecent) {
    return "Offline";
  }

  if (status === "running") {
    return "Running Job";
  }

  return "Idle";
}

function test() {
  const mockNow = new Date("2026-07-03T10:00:00Z").getTime();
  
  console.log("Running R3 Logic Verification Tests...");

  // Test case 1: status is offline (regardless of heartbeat)
  // Even if last heartbeat is 1 second ago, it must say Offline
  const t1 = getMachineBadgeStatus("offline", "2026-07-03T09:59:59Z", mockNow);
  console.log(`Test 1: status="offline", heartbeat=recent -> Badge: ${t1}`);
  assert.strictEqual(t1, "Offline");

  // Test case 2: status is idle, but lastHeartbeatAt is old (e.g. 4 minutes ago)
  const t2 = getMachineBadgeStatus("idle", "2026-07-03T09:56:00Z", mockNow);
  console.log(`Test 2: status="idle", heartbeat=old (4m ago) -> Badge: ${t2}`);
  assert.strictEqual(t2, "Offline");

  // Test case 3: status is running, but lastHeartbeatAt is old (e.g. 5 minutes ago)
  const t3 = getMachineBadgeStatus("running", "2026-07-03T09:55:00Z", mockNow);
  console.log(`Test 3: status="running", heartbeat=old (5m ago) -> Badge: ${t3}`);
  assert.strictEqual(t3, "Offline");

  // Test case 4: status is running, and lastHeartbeatAt is recent (e.g. 1 minute ago)
  const t4 = getMachineBadgeStatus("running", "2026-07-03T09:59:00Z", mockNow);
  console.log(`Test 4: status="running", heartbeat=recent (1m ago) -> Badge: ${t4}`);
  assert.strictEqual(t4, "Running Job");

  // Test case 5: status is idle, and lastHeartbeatAt is recent (e.g. 2 minutes ago)
  const t5 = getMachineBadgeStatus("idle", "2026-07-03T09:58:00Z", mockNow);
  console.log(`Test 5: status="idle", heartbeat=recent (2m ago) -> Badge: ${t5}`);
  assert.strictEqual(t5, "Idle");

  console.log("All R3 badge logic verification tests PASSED!");
}

test();
