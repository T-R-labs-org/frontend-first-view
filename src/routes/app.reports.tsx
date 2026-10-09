import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Copy, Download, FileWarning } from "lucide-react";
import { formatLiveDate, formatLiveDuration, reportForRun, runNumber, useLivePortfolio } from "@/lib/live-data";
import { videoEvidenceEnabled } from "@/lib/feature-flags";
import { IssueDetailView } from "@/components/issue-detail-view";
import { normalizeReport, type ReportIssue } from "@/lib/report-model";
import { buildRepairPackage, repairPackageFilename, type RepairPackageTarget } from "@/lib/repair-package";

export const Route = createFileRoute("/app/reports")({
  head: () => ({ meta: [{ title: "Reports · Matrix QA" }, { name: "robots", content: "noindex" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const live = useLivePortfolio();
  const terminalRuns = live.runs.filter((run) => ["COMPLETED", "PASSED_WITH_FINDINGS", "PARTIALLY_TESTED", "BLOCKED", "FAILED"].includes(run.status));
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ReportIssue | null>(null);
  const [target, setTarget] = useState<RepairPackageTarget>("Raw");
  const selectedRun = terminalRuns.find((run) => run.id === selectedRunId) ?? terminalRuns[0] ?? null;
  const report = reportForRun(live.reports, selectedRun?.id);
  const videoStatus = videoEvidenceEnabled ? report?.artifactStatus?.video?.status ?? (report?.finalVideo || report?.rawVideo ? "ready" : "not_available") : "disabled";
  const confidenceScore = Number((report as Record<string, unknown> | null)?.confidenceScore ?? 0);
  const findings = useMemo(() => {
    if (!selectedRun) return [];
    return live.issues.filter((issue) => issue.reportId === selectedRun.id);
  }, [live.issues, selectedRun]);
  const normalized = useMemo(() => selectedRun && report ? normalizeReport(selectedRun, report) : null, [selectedRun, report]);
  const quickScanFindings = (report?.quickScanHandoff?.findings ?? []).filter((finding) => finding.status === "QUICK_SCAN_CONFIRMED" || (finding.status === "CONFIRMED" && finding.reportSection !== "VISUAL_INTERACTIVE_FINDINGS"));
  const visualFindings = Array.isArray(report?.aiOverview?.findings) ? report.aiOverview.findings : [];
  const repairMarkdown = report && selectedRun
    ? buildRepairPackage({
        target,
        runLabel: runNumber(live.runs, selectedRun.id),
        status: report.status,
        targetUrl: selectedRun.targetUrl,
        startedAt: formatLiveDate(selectedRun.startedAt ?? selectedRun.createdAt),
        duration: formatLiveDuration(report.durationSec),
        quickScanFindings: quickScanFindings.map((finding) => ({
          title: finding.title,
          status: finding.status,
          evidence: finding.evidence,
        })),
        visualFindings: visualFindings.map((finding) => {
          const item = finding as Record<string, unknown>;
          return {
            title: String(item.title ?? "Untitled finding"),
            severity: String(item.severity ?? "unknown"),
            summary: typeof item.explanation === "string" ? item.explanation : undefined,
            evidence: typeof item.evidence === "string" ? item.evidence : undefined,
          };
        }),
        backendFindings: (normalized?.issues ?? []).map((issue) => ({
          title: issue.title,
          severity: issue.severity,
          category: issue.category,
          summary: issue.summary,
          scope: issue.scope,
          remediation: issue.remediation,
        })),
        diagnostic: report.errorMessage,
      })
    : "No terminal report is available yet.";

  const downloadRepairPackage = () => {
    if (!report || !selectedRun || typeof window === "undefined") return;
    const blob = new Blob([repairMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = repairPackageFilename(runNumber(live.runs, selectedRun.id), target);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };
  const scoreTone = confidenceScore >= 90 ? "text-success" : confidenceScore >= 75 ? "text-warning" : "text-destructive";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Live backend reports · {terminalRuns.length} terminal runs</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">Deployment Readiness Reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Evidence-backed summaries assembled from the selected project runs returned by the Matrix QA backend.</p>
        </div>
        {selectedRun && (
          <div className="rounded-md border border-border bg-surface/60 px-5 py-3 text-right">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Confidence score</div>
            <div className={`font-display text-4xl font-semibold ${scoreTone}`}>{confidenceScore || "—"}<span className="text-lg text-muted-foreground">{confidenceScore ? "/100" : ""}</span></div>
            <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">{report?.status ?? "No report"}</div>
          </div>
        )}
      </div>

      {live.error && <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{live.error}</div>}
      {live.loading && <div className="mt-6 rounded-md border border-border p-8 text-center text-sm text-muted-foreground">Loading live reports…</div>}
      {!live.loading && !terminalRuns.length && (
        <div className="mt-6 rounded-md border border-dashed border-border p-12 text-center"><FileWarning className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-display text-base font-semibold">No terminal reports yet</p><p className="mt-1 text-sm text-muted-foreground">Queue a run from the live Test Runs page; in-progress reports intentionally remain incomplete.</p><Link to="/app/runs" className="mt-4 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Open Test Runs</Link></div>
      )}
      {!live.loading && terminalRuns.length > 0 && (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            {terminalRuns.map((run) => (
              <button key={run.id} onClick={() => setSelectedRunId(run.id)} className={`rounded-md border px-3 py-2 text-left ${selectedRun?.id === run.id ? "border-primary/50 bg-primary/10" : "border-border bg-surface/40"}`}>
                <div className="font-mono text-[10px] text-muted-foreground">{runNumber(live.runs, run.id)}</div>
                <div className="mt-1 text-xs font-medium">{run.status} · {run.targetUrl}</div>
              </button>
            ))}
          </div>
          {selectedRun && report && (
            <>
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Metric label="Passed" value={report.passed ?? report.summary?.assertionsPassed ?? 0} tone="text-success" />
                <Metric label="Failed" value={report.failed ?? report.summary?.assertionsFailed ?? 0} tone="text-destructive" />
                <Metric label="Warnings" value={Array.isArray((report as Record<string, unknown>).auditLog) ? ((report as Record<string, unknown>).auditLog as unknown[]).length : 0} tone="text-warning" />
                <Metric label="Evidence events" value={Array.isArray(report.events) ? report.events.length : 0} />
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section className="surface-card overflow-hidden">
                  <header className="border-b border-border px-5 py-3"><h2 className="font-display text-sm font-semibold">Quick Scan / DOM Findings</h2><p className="text-[11px] text-muted-foreground">Deterministic checks, authoritative only for the measured DOM property</p></header>
                  <ul className="divide-y divide-border">
                    {quickScanFindings.map((finding) => <li key={finding.id} className="px-5 py-3"><div className="text-sm font-medium">{finding.title}</div><div className="mt-1 text-[11px] text-muted-foreground">{finding.evidence}</div><div className="mt-1 font-mono text-[10px] uppercase text-primary">{finding.provenance ?? "ONBOARDING_QUICK_SCAN"}</div></li>)}
                    {!quickScanFindings.length && <li className="p-6 text-center text-sm text-muted-foreground">No confirmed deterministic DOM findings.</li>}
                  </ul>
                </section>
                <section className="surface-card overflow-hidden">
                  <header className="border-b border-border px-5 py-3"><h2 className="font-display text-sm font-semibold">Visual & Interactive Findings</h2><p className="text-[11px] text-muted-foreground">Chromium-confirmed actions, mutations, screenshots, video, and layout assertions</p></header>
                  <ul className="divide-y divide-border">
                    {visualFindings.map((finding, index) => <li key={`${String((finding as Record<string, unknown>).title ?? "finding")}-${index}`} className="px-5 py-3"><div className="text-sm font-medium">{String((finding as Record<string, unknown>).title ?? "Untitled finding")}</div><div className="mt-1 text-[11px] text-muted-foreground">{String((finding as Record<string, unknown>).explanation ?? "Chromium evidence-backed finding")}</div></li>)}
                    {!visualFindings.length && <li className="p-6 text-center text-sm text-muted-foreground">No Chromium-confirmed visual or interactive findings.</li>}
                  </ul>
                </section>
              </div>
              <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className="surface-card overflow-hidden lg:col-span-2">
                  <header className="border-b border-border px-5 py-3"><h2 className="font-display text-sm font-semibold">Prioritized defect ledger</h2><p className="text-[11px] text-muted-foreground">Select any issue to open the shared evidence detail view.</p></header>
                  <ul className="divide-y divide-border">
                    {(normalized?.issues ?? []).map((issue) => <li key={issue.id}><button type="button" onClick={() => setSelectedIssue(issue)} className="grid w-full gap-3 px-5 py-4 text-left hover:bg-accent/30 md:grid-cols-[100px_minmax(0,1fr)_150px_120px_24px]"><SeverityBadge severity={issue.severity === "warning" ? "medium" : issue.severity === "info" ? "low" : issue.severity} /><div className="min-w-0"><div className="truncate text-sm font-medium">{issue.title}</div><div className="mt-1 truncate text-[11px] text-muted-foreground">{issue.summary}</div></div><span className="text-xs text-muted-foreground">{issue.category}</span><span className="text-xs text-muted-foreground">{issue.kind} · {issue.occurrences}×</span><span className="text-muted-foreground">›</span></button></li>)}
                    {!normalized?.issues.length && <li className="p-8 text-center text-sm text-muted-foreground">No distinct issues returned for this report.</li>}
                  </ul>
                </section>
                <section className="surface-card sticky top-4 flex h-fit flex-col overflow-hidden">
                  <header className="border-b border-border px-5 py-3"><h2 className="font-display text-sm font-semibold">Evidence package</h2><p className="text-[11px] text-muted-foreground">Live backend artifact links and repair notes</p></header>
                  <div className="flex gap-1 border-b border-border bg-surface-2/40 p-1">{(["Cursor", "Claude Code", "GitHub", "Raw"] as const).map((item) => <button key={item} onClick={() => setTarget(item)} className={`flex-1 rounded px-2 py-1 text-xs font-medium ${target === item ? "bg-primary/15 text-foreground" : "text-muted-foreground"}`}>{item}</button>)}</div>
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-[11px] leading-relaxed">{repairMarkdown}</pre>
                  <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2/40 px-5 py-3">
                    <button onClick={() => navigator.clipboard?.writeText(repairMarkdown)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"><Copy className="h-3.5 w-3.5" /> Copy markdown</button>
                    <button onClick={downloadRepairPackage} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold"><Download className="h-3.5 w-3.5" /> Download repair package</button>
                    {!videoEvidenceEnabled && <span className="text-[11px] text-muted-foreground">Screenshot-first evidence · screenshots and report retained</span>}
                    {videoEvidenceEnabled && videoStatus !== "ready" && videoStatus !== "raw_only" && <span className="text-[11px] text-warning">Video unavailable; run evidence is still retained</span>}
                    {typeof report.reportUrl === "string" && report.reportUrl && <a href={report.reportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary"><Download className="h-3 w-3" /> report.md</a>}
                    <Link to="/app/runs/$runId" params={{ runId: selectedRun.id }} search={{ projectId: selectedRun.projectId }} className="ml-auto text-xs text-primary">Open run</Link>
                  </div>
                </section>
              </div>
            </>
          )}
        </>
      )}
      <p className="mt-6 text-[11px] text-muted-foreground">Repair packages are generated from the selected terminal run and can be copied or downloaded for the chosen handoff target.</p>
      {selectedIssue && <IssueDetailView issue={selectedIssue} onClose={() => setSelectedIssue(null)} />}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) { return <div className="surface-card px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-0.5 font-display text-2xl font-semibold ${tone ?? ""}`}>{value}</div></div>; }
function SeverityBadge({ severity }: { severity: "critical" | "high" | "medium" | "low" }) { const tone = { critical: "bg-destructive/15 text-destructive border-destructive/30", high: "bg-warning/15 text-warning border-warning/30", medium: "bg-info/15 text-info border-info/30", low: "bg-surface-2 text-muted-foreground border-border" }[severity]; return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}>{severity}</span>; }
