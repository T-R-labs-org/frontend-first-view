import assert from "node:assert/strict";
import {
  buildRepairPackage,
  repairPackageFilename,
} from "../src/lib/repair-package.ts";

const base = {
  runLabel: "#12",
  status: "PASSED_WITH_FINDINGS",
  targetUrl: "https://example.test/checkout",
  startedAt: "10/4/2026, 12:00:00 PM",
  duration: "1m 07s",
  quickScanFindings: [
    {
      title: "Missing form label",
      status: "QUICK_SCAN_CONFIRMED",
      evidence: "input[name=email] has no associated label",
    },
  ],
  visualFindings: [
    {
      title: "Checkout button does not advance",
      severity: "high",
      summary: "Click completed but route did not change.",
      evidence: "Chromium interaction at /checkout",
    },
  ],
  backendFindings: [
    {
      title: "POST /api/order returned 500",
      severity: "critical",
      category: "network",
      scope: "/checkout",
      remediation: "Inspect order creation error handling.",
    },
  ],
  diagnostic: "Order request failed.",
};

const cursor = buildRepairPackage({ ...base, target: "Cursor" });
assert.match(cursor, /# Matrix QA Repair Package/);
assert.match(cursor, /Prepared for: Cursor/);
assert.match(cursor, /Missing form label/);
assert.match(cursor, /Checkout button does not advance/);
assert.match(cursor, /POST \/api\/order returned 500/);
assert.match(cursor, /smallest safe fix/i);

const claude = buildRepairPackage({ ...base, target: "Claude Code" });
assert.match(claude, /Prepared for: Claude Code/);
assert.match(claude, /source of truth/i);
assert.notEqual(cursor, claude);

const github = buildRepairPackage({ ...base, target: "GitHub" });
assert.match(github, /Prepared for: GitHub/);
assert.match(github, /issue\/PR handoff/);
assert.match(github, /POST \/api\/order returned 500/);
assert.notEqual(github, cursor);

const raw = buildRepairPackage({
  ...base,
  target: "Raw",
  quickScanFindings: [],
  visualFindings: [],
  backendFindings: [],
  diagnostic: null,
});
assert.match(raw, /No confirmed deterministic DOM findings were recorded\./);
assert.match(raw, /No Chromium-confirmed visual or interactive findings were recorded\./);
assert.match(raw, /No additional normalized backend findings were recorded\./);
assert.match(raw, /## Backend diagnostic\n\nNone/);

assert.equal(repairPackageFilename("#12", "Claude Code"), "matrixqa-repair-12-claude-code.md");
assert.equal(repairPackageFilename(" Run 9 / prod ", "Raw"), "matrixqa-repair-run-9-prod-raw.md");

console.log("repair package export: 6 cases passed");
