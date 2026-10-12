export type RepairPackageTarget = "Cursor" | "Claude Code" | "GitHub" | "Raw";

export interface RepairPackageFinding {
  title: string;
  severity?: string;
  status?: string;
  category?: string;
  summary?: string;
  evidence?: string;
  scope?: string;
  remediation?: string;
}

export interface RepairPackageInput {
  target: RepairPackageTarget;
  runLabel: string;
  status: string;
  targetUrl: string;
  startedAt: string;
  duration: string;
  quickScanFindings?: RepairPackageFinding[];
  visualFindings?: RepairPackageFinding[];
  backendFindings?: RepairPackageFinding[];
  diagnostic?: string | null;
}

const EXPORT_BLOCKED = "Repair export withheld: sensitive content could not be safely removed.";
const SENSITIVE_KEY = "(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|secret|client[_-]?secret|access[_-]?token|refresh[_-]?token|token|api[_-]?key|credential|session[_-]?id|x-[a-z0-9_-]+)";

/** Apply at the export boundary even when upstream evidence was already redacted. */
export function sanitizeRepairText(value: string): string {
  if (value.length > 100_000) throw new Error(EXPORT_BLOCKED);
  let result = value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  result = result.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]");
  result = result.replace(/https?:\/\/[^\s<>"'`]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      if ([...url.searchParams.keys()].some((key) => /^(?:x-amz-|x-goog-|signature$|sig$|expires$|awsaccesskeyid$)/i.test(key))) {
        return "[protected artifact URL omitted]";
      }
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      throw new Error(EXPORT_BLOCKED);
    }
  });
  result = result.replace(/\bdata:[^\s]+/gi, "[inline data omitted]");
  result = result.replace(/("headers?"\s*:\s*)\{[^{}]*\}/gi, '$1"[redacted]"');
  result = result.replace(new RegExp(`(["']${SENSITIVE_KEY}["']\\s*:\\s*)("(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`, "gi"), '$1"[redacted]"');
  result = result.replace(/\b(?:cookie|set-cookie)\s*:[^\r\n]+/gi, "Cookie: [redacted]");
  result = result.replace(/^(\s*x-[a-z0-9_-]+\s*:\s*)[^\r\n]+/gim, "$1[redacted]");
  result = result.replace(new RegExp(`(\\b${SENSITIVE_KEY}\\s*[:=]\\s*)(?:Bearer\\s+|Basic\\s+)?[^\\s,;\\"'&<>]+`, "gi"), "$1[redacted]");
  result = result.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted authorization]");
  result = result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted token]");
  // Incomplete key blocks and nested header payloads cannot be safely exported.
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|"headers?"\s*:\s*\{|\b(?:javascript|file):/i.test(result)) throw new Error(EXPORT_BLOCKED);
  return result;
}

const compact = (value: unknown, fallback = "—") => {
  if (typeof value !== "string") return fallback;
  const normalized = sanitizeRepairText(value).replace(/\s+/g, " ").trim();
  return normalized || fallback;
};

const targetInstructions: Record<RepairPackageTarget, string[]> = {
  Cursor: [
    "Use this package as implementation context, not as a source of new requirements.",
    "Reproduce each evidence-backed finding before changing code when practical.",
    "Make the smallest safe fix, preserve existing security boundaries, and run relevant tests.",
    "Summarize files changed, tests run, and any finding that could not be reproduced.",
  ],
  "Claude Code": [
    "Treat the evidence below as the source of truth for the repair task.",
    "Inspect the relevant route/component before editing and avoid unrelated refactors.",
    "Implement the smallest safe correction, run relevant checks, and keep security/privacy guards intact.",
    "Report the files changed, validation performed, and any unresolved evidence-backed finding.",
  ],
  GitHub: [
    "Use this as an issue/PR handoff for the reported run.",
    "Link code changes to the evidence-backed findings below and keep unrelated changes out of scope.",
    "Include reproduction notes, validation steps, and remaining risk in the PR description.",
  ],
  Raw: [
    "Neutral evidence package. No agent-specific workflow is assumed.",
    "Only findings supported by the captured run evidence should be treated as confirmed.",
  ],
};

const renderFinding = (finding: RepairPackageFinding) => {
  const prefix = finding.severity
    ? `[${compact(finding.severity).toUpperCase()}]`
    : finding.status
      ? `[${compact(finding.status).toUpperCase()}]`
      : "[FINDING]";
  const lines = [`- **${prefix} ${compact(finding.title, "Untitled finding")}**`];
  if (finding.category) lines.push(`  - Category: ${compact(finding.category)}`);
  if (finding.scope) lines.push(`  - Scope: ${compact(finding.scope)}`);
  if (finding.summary) lines.push(`  - Summary: ${compact(finding.summary)}`);
  if (finding.evidence) lines.push(`  - Evidence: ${compact(finding.evidence)}`);
  if (finding.remediation) lines.push(`  - Remediation: ${compact(finding.remediation)}`);
  return lines.join("\n");
};

const renderSection = (
  title: string,
  findings: RepairPackageFinding[] | undefined,
  emptyMessage: string,
) => {
  const items = findings ?? [];
  return `## ${title}\n\n${items.length ? items.map(renderFinding).join("\n\n") : emptyMessage}`;
};

export function buildRepairPackage(input: RepairPackageInput): string {
  const instructions = targetInstructions[input.target]
    .map((line) => `- ${line}`)
    .join("\n");

  const markdown = [
    "# Matrix QA Repair Package",
    "",
    `Prepared for: ${input.target}`,
    "",
    "## Run",
    "",
    `- Run: ${compact(input.runLabel)}`,
    `- Status: ${compact(input.status)}`,
    `- Target: ${compact(input.targetUrl)}`,
    `- Started: ${compact(input.startedAt)}`,
    `- Duration: ${compact(input.duration)}`,
    "",
    "## Repair instructions",
    "",
    instructions,
    "",
    "## Evidence boundary",
    "",
    "- Do not invent findings that are not present in this package.",
    "- Treat withheld, unavailable, or unverified evidence as unavailable rather than assuming a result.",
    "- Preserve authentication, authorization, privacy, and redaction controls while fixing product defects.",
    "",
    renderSection(
      "Quick Scan / DOM Findings",
      input.quickScanFindings,
      "No confirmed deterministic DOM findings were recorded.",
    ),
    "",
    renderSection(
      "Visual & Interactive Findings",
      input.visualFindings,
      "No Chromium-confirmed visual or interactive findings were recorded.",
    ),
    "",
    renderSection(
      "Backend Findings",
      input.backendFindings,
      "No additional normalized backend findings were recorded.",
    ),
    "",
    "## Backend diagnostic",
    "",
    compact(input.diagnostic ?? "", "None"),
    "",
  ].join("\n");
  // Verify the finished payload as well, so future fields cannot bypass the guard.
  return sanitizeRepairText(markdown);
}

export function tryBuildRepairPackage(input: RepairPackageInput): { markdown: string; error: string | null } {
  try {
    return { markdown: buildRepairPackage(input), error: null };
  } catch {
    return { markdown: "", error: EXPORT_BLOCKED };
  }
}

export function repairPackageFilename(runLabel: string, target: RepairPackageTarget): string {
  const run = compact(runLabel, "run")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "run";
  const destination = target
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "raw";
  return `matrixqa-repair-${run}-${destination}.md`;
}
