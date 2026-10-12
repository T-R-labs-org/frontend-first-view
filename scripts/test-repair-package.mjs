import assert from "node:assert/strict";
import {
  buildRepairPackage,
  repairPackageFilename,
  sanitizeRepairText,
  tryBuildRepairPackage,
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

const sensitive = [
  ["Authorization: Bearer synthetic-bearer-724", "synthetic-bearer-724"],
  ['{"password":"synthetic-password-724"}', "synthetic-password-724"],
  ["Cookie: session=synthetic-cookie-724; csrf=synthetic-csrf-724", "synthetic-cookie-724"],
  ["X-Custom-Credential: synthetic-custom-724", "synthetic-custom-724"],
  ["https://store.test/evidence.png?X-Amz-Signature=synthetic-signature-724&X-Amz-Expires=600", "synthetic-signature-724"],
  ["https://synthetic-user:synthetic-url-password-724@example.test/checkout?access_token=synthetic-query-token-724#private", "synthetic-url-password-724"],
  ['{"headers":{"X-Custom":"synthetic-header-724"}}', "synthetic-header-724"],
  ["Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.syntheticSignature", "eyJzdWIiOiJzeW50aGV0aWMifQ"],
  ["-----BEGIN PRIVATE KEY-----\nsynthetic-private-key-724\n-----END PRIVATE KEY-----", "synthetic-private-key-724"],
];
for (const target of ["Cursor", "Claude Code", "GitHub", "Raw"]) {
  for (const [source, secret] of sensitive) {
    const output = buildRepairPackage({
      ...base, target, targetUrl: source, runLabel: source, diagnostic: source,
      quickScanFindings: [{ title: source, evidence: source }],
      visualFindings: [{ title: source, summary: source }],
      backendFindings: [{ title: source, category: source, scope: source, remediation: source }],
    });
    assert.ok(!output.includes(secret), `${target} must remove ${secret}`);
    assert.ok(!output.includes("synthetic-csrf-724"), `${target} must remove every cookie value`);
    assert.ok(!output.includes("synthetic-query-token-724"), `${target} must omit URL queries`);
    assert.match(output, /## Backend Findings/);
  }
  const blocked = tryBuildRepairPackage({ ...base, target, diagnostic: "-----BEGIN PRIVATE KEY-----incomplete" });
  assert.equal(blocked.markdown, "");
  assert.match(blocked.error, /export withheld/i);
}
assert.equal(sanitizeRepairText("https://example.test/checkout"), "https://example.test/checkout");
assert.match(sanitizeRepairText("GET /api/order returned HTTP 500"), /HTTP 500/);
assert.equal(tryBuildRepairPackage({ ...base, target: "Raw", diagnostic: "a".repeat(100_001) }).markdown, "");
assert.equal(tryBuildRepairPackage({ ...base, target: "Raw", diagnostic: '{"headers":{"nested":{"key":"synthetic"}}}' }).markdown, "");
console.log("repair package export: 6 existing cases and 44 safety cases passed");
