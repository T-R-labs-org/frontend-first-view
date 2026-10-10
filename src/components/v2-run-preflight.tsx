import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Play,
  Radar,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  organizationsApi,
  projectsApi,
  v2Api,
  formatRunStartError,
  type Project,
  type ProviderCapacityDecision,
  type TriggerRunResponse,
  type V2ApplicationScan,
  type V2Environment,
  type V2TestDataFixture,
  type V2MissionAccessMode,
  normalizeV2PlannerMode,
  type V2PlannerMode,
  type V2TestPlan,
  type ProjectRole,
  type ScenarioCatalogItem,
  type V2Viewport,
  scenariosApi,
} from "@/lib/api-client";
import {
  RunConfigurationPanel,
  type MatrixSelection,
  type TriggerRunPayload,
} from "@/components/run-configuration-panel";

type Phase = "idle" | "scanning" | "planning" | "ready" | "starting";

type Props = {
  project: Project;
  initialMissionGoal?: string;
  autoStart?: boolean;
  initialTargetAuthorizationConfirmed?: boolean;
  onClose: () => void;
  onStarted: (response: TriggerRunResponse & { planId?: string }, projectId?: string) => void;
};

const sleep = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function discoveryProgressLabel(phase: string | undefined) {
  switch (phase) {
    case "PRECHECK":
      return "Checking target reachability";
    case "BROWSER_START":
      return "Starting isolated browser";
    case "MAPPING":
      return "Mapping same-origin pages";
    case "AI_ENRICHMENT":
      return "Summarizing discovery evidence";
    case "FINALIZING":
      return "Saving the fresh map";
    case "COMPLETED":
      return "Discovery complete";
    case "FAILED":
      return "Discovery stopped";
    default:
      return "Waiting for discovery progress";
  }
}

export function V2RunPreflight({
  project,
  initialMissionGoal,
  autoStart = false,
  initialTargetAuthorizationConfirmed = false,
  onClose,
  onStarted,
}: Props) {
  const [missionGoal, setMissionGoal] = useState(
    initialMissionGoal?.trim() || "Test this website thoroughly.",
  );
  const [projects, setProjects] = useState<Project[]>([project]);
  const [selectedProjectId, setSelectedProjectId] = useState(project.id);
  const [accessMode] = useState<V2MissionAccessMode>("ANONYMOUS");
  const [environments, setEnvironments] = useState<V2Environment[]>([]);
  const [fixtures, setFixtures] = useState<V2TestDataFixture[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [catalogScenarios, setCatalogScenarios] = useState<ScenarioCatalogItem[]>([]);
  const [projectRoles, setProjectRoles] = useState<ProjectRole[]>([]);
  const [viewportOptions, setViewportOptions] = useState<V2Viewport[]>([]);
  const [configurationLoading, setConfigurationLoading] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [mode, setMode] = useState<V2PlannerMode>("QUICK_SMOKE");
  const [planName, setPlanName] = useState("Fresh adaptive smoke plan");
  const [enableVision, setEnableVision] = useState(false);
  const [enableRecovery, setEnableRecovery] = useState(false);
  const [targetAuthorizationConfirmed, setTargetAuthorizationConfirmed] = useState(
    Boolean(initialTargetAuthorizationConfirmed),
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const autoStarted = useRef(false);
  const [scan, setScan] = useState<V2ApplicationScan | null>(null);
  const [plan, setPlan] = useState<V2TestPlan | null>(null);
  const [capacityStatus, setCapacityStatus] = useState<ProviderCapacityDecision | null>(null);
  const [queuedResponse, setQueuedResponse] = useState<
    (TriggerRunResponse & { planId?: string }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProject = projects.find((item) => item.id === selectedProjectId) ?? project;

  useEffect(() => {
    let cancelled = false;
    organizationsApi
      .list()
      .then(async (organizations) => {
        const activeOrganizationId =
          localStorage.getItem("matrix_qa_active_organization") ||
          project.organizationId ||
          organizations[0]?.id;
        if (!activeOrganizationId) return;
        const items = await projectsApi.list(activeOrganizationId, project.workspaceId);
        if (cancelled) return;
        setProjects(items.some((item) => item.id === project.id) ? items : [project, ...items]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    setEnvironments([]);
    setFixtures([]);
    setEnvironmentId("");
    setFixtureId("");
    setScan(null);
    setPlan(null);
    setCapacityStatus(null);
    setQueuedResponse(null);
    Promise.all([
      v2Api.listEnvironments(selectedProject.id),
      v2Api.listTestDataFixtures(selectedProject.id),
    ])
      .then(([environmentItems, fixtureItems]) => {
        if (!cancelled) {
          setEnvironments(environmentItems);
          setEnvironmentId((current) => current || environmentItems[0]?.id || "");
          setFixtures(
            fixtureItems.filter(
              (fixture) => fixture.status === "ACTIVE" || fixture.status === "DRAFT",
            ),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedProject.id]);

  useEffect(() => {
    let cancelled = false;
    setConfigurationLoading(true);
    setConfigurationError(null);
    setCatalogScenarios([]);
    setProjectRoles([]);
    setViewportOptions([]);
    Promise.all([
      scenariosApi.list(selectedProject.id),
      v2Api.listViewports(mode),
      environmentId
        ? v2Api.listRoles(selectedProject.id, environmentId)
        : Promise.resolve([] as ProjectRole[]),
    ])
      .then(([scenarios, viewports, roles]) => {
        if (cancelled) return;
        setCatalogScenarios(
          scenarios.filter((scenario) => scenario.isVerified && scenario.steps.length > 0),
        );
        setViewportOptions(viewports);
        setProjectRoles(roles);
      })
      .catch((cause) => {
        if (!cancelled)
          setConfigurationError(
            cause instanceof Error ? cause.message : "Unable to load run configuration metadata.",
          );
      })
      .finally(() => {
        if (!cancelled) setConfigurationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [environmentId, mode, selectedProject.id]);

  const blockedPolicies = useMemo(
    () =>
      plan?.policyDecisions.filter(
        (decision) => decision.status !== "ALLOWED" && decision.status !== "APPROVED",
      ) ?? [],
    [plan],
  );
  const aiPlan = plan?.projectMap?.aiPlan;
  const selectedViewports =
    viewportOptions.length > 0
      ? viewportOptions
      : (plan?.projectMap?.viewportMatrix ??
        plan?.projectMap?.billingBreakdown?.viewportMatrix ??
        []);
  const readyToStart = Boolean(
    plan &&
    plan.status !== "FAILED" &&
    plan.scenarios.length > 0 &&
    blockedPolicies.length === 0 &&
    targetAuthorizationConfirmed,
  );
  const waitingForProvider = capacityStatus?.status === "WAITING" && Boolean(queuedResponse);
  const scanProgress = scan?.summary?.progress;
  const scanProgressLabel = discoveryProgressLabel(scanProgress?.phase);

  const prepare = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!environmentId) {
      setError(
        "You must configure an Environment (e.g., Staging) in the project settings before executing a run.",
      );
      return;
    }
    setError(null);
    setPlan(null);
    setScan(null);
    setCapacityStatus(null);
    setQueuedResponse(null);
    if (!targetAuthorizationConfirmed) {
      setError(
        "Confirm that you own or are authorized to test this target before starting Quick Scan.",
      );
      return;
    }
    setPhase("scanning");
    try {
      const createdScan = await v2Api.startScan(selectedProject.id, {
        environmentId,
        missionGoal: missionGoal.trim() || "Test this website thoroughly.",
        accessMode,
      });
      setScan(createdScan);
      let current = createdScan;
      while (current.status === "PENDING" || current.status === "RUNNING") {
        await sleep(1800);
        current = await v2Api.getScan(current.id);
        setScan(current);
      }
      if (current.status !== "COMPLETED")
        throw new Error(current.errorMessage || "Fresh discovery could not complete.");
      setPhase("planning");
      const createdPlan = await v2Api.createPlanFromScan(current.id, {
        name: planName.trim() || "Fresh adaptive smoke plan",
        mode,
        missionGoal: missionGoal.trim() || "Test this website thoroughly.",
        accessMode,
        ...(fixtureId ? { fixtureId } : {}),
      });
      setPlan(createdPlan);
      const blocked = createdPlan.policyDecisions.some(
        (decision) => decision.status !== "ALLOWED" && decision.status !== "APPROVED",
      );
      if (autoStart && createdPlan.scenarios.length > 0 && !blocked) {
        await start(
          {
            projectId: selectedProject.id,
            environmentId,
            ...defaultMatrixSelection(createdPlan),
          },
          createdPlan,
        );
      } else {
        setPhase("ready");
      }
    } catch (cause) {
      setPhase("idle");
      setError(cause instanceof Error ? cause.message : "Unable to prepare the browser test.");
    }
  };

  const defaultMatrixSelection = (candidate: V2TestPlan): MatrixSelection => ({
    scenarioIds: catalogScenarios.length
      ? catalogScenarios.slice(0, 2).map((scenario) => scenario.id)
      : candidate.scenarios.slice(0, 2).map((scenario) => scenario.id),
    viewportIds: selectedViewports.map((viewport) => viewport.id),
    networkProfiles: ["FAST"],
    roleIds: (projectRoles.filter((role) => role.roleType === "GUEST").length
      ? projectRoles.filter((role) => role.roleType === "GUEST")
      : projectRoles
    )
      .slice(0, 1)
      .map((role) => role.id),
  });

  const start = async (payload: TriggerRunPayload, planOverride?: V2TestPlan) => {
    const candidate = planOverride ?? plan;
    const blocked =
      candidate?.policyDecisions.some(
        (decision) => decision.status !== "ALLOWED" && decision.status !== "APPROVED",
      ) ?? true;
    if (
      !candidate ||
      candidate.status === "FAILED" ||
      candidate.scenarios.length === 0 ||
      blocked ||
      !targetAuthorizationConfirmed ||
      payload.scenarioIds.length === 0 ||
      payload.viewportIds.length === 0 ||
      payload.networkProfiles.length === 0 ||
      payload.roleIds.length === 0
    )
      return;
    setError(null);
    setPhase("starting");
    try {
      const approved =
        candidate.status === "APPROVED" ? candidate : await v2Api.approvePlan(candidate.id);
      const response = await v2Api.runPlan(approved.id, {
        accessMode,
        enableVision,
        enableRecovery,
        scenarioIds: payload.scenarioIds,
        viewportIds: payload.viewportIds,
        networkProfiles: payload.networkProfiles,
        roleIds: payload.roleIds,
        targetAuthorizationConfirmed,
      });
      const providerCapacity = response.metadata?.providerCapacity;
      if (providerCapacity?.status === "WAITING") {
        setCapacityStatus(providerCapacity);
        setQueuedResponse(response);
        setPhase("ready");
        if (autoStart) onStarted(response, selectedProject.id);
        return;
      }
      onStarted(response, selectedProject.id);
    } catch (cause) {
      setPhase("ready");
      setError(
        formatRunStartError(
          cause,
          "Unable to start the browser test. Capacity is managed automatically; please try again when the current provider window is available.",
        ),
      );
    }
  };

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    void prepare();
    // This effect intentionally runs once per modal instance; the ref prevents duplicate starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const busy = phase === "scanning" || phase === "planning" || phase === "starting";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="matrixqa-preflight-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur-sm sm:items-center"
    >
      <div className="surface-card max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto sm:max-h-[calc(100vh-3rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Radar className="h-5 w-5" />
            </span>
            <div>
              <h2 id="matrixqa-preflight-title" className="font-display text-lg font-semibold">
                Prepare a browser test
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                The backend runs a deterministic Step 0 Quick Scan in the same Playwright page as
                the browser test and records it in the report Overview.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
            aria-label="Close"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </header>
        <form
          onSubmit={(event) => {
            void prepare(event);
          }}
          className="space-y-4 p-5"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">
              What should Matrix QA investigate?
            </span>
            <textarea
              value={missionGoal}
              onChange={(event) => setMissionGoal(event.target.value)}
              disabled={busy}
              rows={3}
              maxLength={2_000}
              className="w-full resize-y rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm leading-5 outline-none focus:border-primary disabled:opacity-60"
              placeholder="Test this website thoroughly."
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Describe the goal in your own words. Matrix QA will decide the safe coverage plan from
              live observations.
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Project</span>
            <select
              value={selectedProjectId}
              onChange={(event) => {
                setSelectedProjectId(event.target.value);
                setTargetAuthorizationConfirmed(false);
                setPhase("idle");
                setError(null);
              }}
              disabled={busy || projects.length === 0}
              className="w-full rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium">Target Environment</span>
            <select
              value={environmentId}
              onChange={(event) => {
                setEnvironmentId(event.target.value);
                setTargetAuthorizationConfirmed(false);
                setScan(null);
              }}
              disabled={busy || environments.length === 0}
              className="w-full rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">Select an environment</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name} · {environment.kind}
                </option>
              ))}
            </select>
          </label>
          {environments.length === 0 && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              You must configure an Environment (e.g., Staging) in the project settings before
              executing a run.
            </div>
          )}
          {fixtures.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">
                Test-data fixture{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <select
                value={fixtureId}
                onChange={(event) => setFixtureId(event.target.value)}
                disabled={busy}
                className="w-full rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">No fixture selected</option>
                {fixtures.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.name} · {fixture.status}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-muted-foreground">
                Selection records the expected data contract; lifecycle execution remains
                operator-controlled.
              </span>
            </label>
          )}
          <label className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs">
            <input
              type="checkbox"
              checked={targetAuthorizationConfirmed}
              onChange={(event) => setTargetAuthorizationConfirmed(event.target.checked)}
              disabled={busy}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />I own or am authorized to test
                this target
              </span>
              <span className="mt-0.5 block leading-5 text-muted-foreground">
                The Step 0 scan and browser agent will use this target only for the authorized QA
                run.
              </span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Plan mode</span>
              <select
                value={mode}
                onChange={(event) => setMode(normalizeV2PlannerMode(event.target.value))}
                disabled={busy}
                className="w-full rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="QUICK_SMOKE">Quick smoke</option>
                <option value="STANDARD_ADAPTIVE">Standard adaptive</option>
                <option value="DEEP_MATRIX">Deep matrix</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium">Plan name</span>
              <input
                value={planName}
                onChange={(event) => setPlanName(event.target.value)}
                disabled={busy}
                className="w-full rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
          </div>
          {phase === "idle" && (
            <p className="rounded-md border border-border/60 bg-surface-2/30 p-3 text-xs leading-5 text-muted-foreground">
              Create a fresh map and run-specific plan first. The browser worker will execute Step 0
              Quick Scan before functional actions. The browser starts only after the plan is ready.
            </p>
          )}
          {waitingForProvider && capacityStatus && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <strong className="font-semibold">Shared test capacity is queued.</strong>{" "}
                {capacityStatus.reason ||
                  "The run is waiting for the next available test capacity window."}{" "}
                {capacityStatus.retryAt ? (
                  <>
                    {" "}
                    It will be retried automatically after{" "}
                    <strong>{new Date(capacityStatus.retryAt).toLocaleString()}</strong>.
                  </>
                ) : null}
              </span>
            </div>
          )}
          {phase === "ready" && plan && (
            <div className="grid gap-2 rounded-md border border-border/70 bg-surface-2/30 p-3 text-xs">
              <div className="font-medium text-foreground">Optional run capabilities</div>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={enableVision}
                  onChange={(event) => setEnableVision(event.target.checked)}
                  disabled={busy}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Eye className="h-3.5 w-3.5 text-primary" />
                    Enable vision checks
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Off by default. Lets the worker request visual screenshot analysis when text
                    evidence is insufficient.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={enableRecovery}
                  onChange={(event) => setEnableRecovery(event.target.checked)}
                  disabled={busy}
                  className="mt-0.5 accent-primary"
                />
                <span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <RefreshCw className="h-3.5 w-3.5 text-primary" />
                    Enable recovery attempts
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    Off by default. Lets the worker try approved equivalent locators when the
                    primary locator is not actionable.
                  </span>
                </span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                Capacity handling is managed automatically, and any provider wait is retried without
                requiring another submission.
              </p>
            </div>
          )}
          {(phase === "scanning" || phase === "planning") && (
            <div
              aria-live="polite"
              className="rounded-md border border-primary/30 bg-primary/5 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === "scanning"
                  ? "Mapping the current application…"
                  : "Building the run-specific plan…"}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                This can take a little longer on targets with many links or when the AI provider is
                waking up. Keep this window open; the request has a two-minute safety budget.
              </p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                <span>01 · Step 0 Quick Scan runs in the backend browser worker</span>
                <span className={scan?.status === "COMPLETED" ? "text-success" : ""}>
                  02 · Fresh read-only discovery{" "}
                  {scan?.status === "COMPLETED" ? "complete" : "waiting"}
                </span>
                {phase === "scanning" && scan?.status !== "COMPLETED" && (
                  <>
                    <span className="text-foreground">Current step: {scanProgressLabel}</span>
                    {typeof scanProgress?.pagesScanned === "number" && (
                      <span>
                        {scanProgress.pagesScanned}/{scanProgress.maxPages ?? 8} pages captured ·{" "}
                        {scanProgress.queuedUrls ?? 0} queued
                      </span>
                    )}
                    {scanProgress?.lastRoute && (
                      <span className="truncate">Last route: {scanProgress.lastRoute}</span>
                    )}
                  </>
                )}
                <span className={plan ? "text-success" : ""}>
                  03 · Test planning {plan ? "complete" : "waiting"}
                </span>
                <span>04 · Policy review waiting</span>
              </div>
            </div>
          )}
          {phase === "ready" && plan && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <CheckCircle2 className="h-4 w-4" /> Fresh test plan ready
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {plan.scenarios.length} test scenarios · {plan.mode.replaceAll("_", " ")}
                  </p>
                  {selectedViewports.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-foreground/80">
                        {selectedViewports.length} isolated viewport
                        {selectedViewports.length === 1 ? "" : "s"} ·{" "}
                        {selectedViewports
                          .map(
                            (viewport) =>
                              `${viewport.label} (${viewport.width}×${viewport.height})`,
                          )
                          .join(" · ")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        The same approved scenarios will run once in each viewport context.
                        Estimates scale with the selected viewport count.
                      </p>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-semibold text-success">Ready</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    fresh plan prepared
                  </div>
                </div>
              </div>
              <p className="max-w-md text-xs leading-5 text-foreground/80">
                Mission: {aiPlan?.missionSummary ?? plan.projectMap?.mission?.goal ?? missionGoal}
              </p>
              {plan.projectMap?.coverageFrontier?.counts && (
                <p className="text-xs text-muted-foreground">
                  Coverage frontier: {plan.projectMap.coverageFrontier.counts.total} discovered
                  items · {plan.projectMap.coverageFrontier.counts.untested} untested ·{" "}
                  {plan.projectMap.coverageFrontier.counts.blocked} blocked
                </p>
              )}
              <div className="rounded-md border border-primary/20 bg-background/30 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-foreground">Quick Scan runs with the test</strong>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                    Step 0
                  </span>
                </div>
                <p className="mt-1 leading-5 text-muted-foreground">
                  The same Playwright page will run the deterministic structural scan before
                  functional actions. Results will appear in the run Overview.
                </p>
              </div>
              <div className="rounded-md border border-primary/20 bg-background/30 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-foreground">Plan rationale</strong>
                </div>
                <p className="mt-1 leading-5 text-muted-foreground">
                  {plan.plannerRationale ??
                    aiPlan?.planningRationale ??
                    "The plan selected these scenarios from the fresh discovery evidence."}
                </p>
                {aiPlan?.uncoveredAreas?.length ? (
                  <p className="mt-2 leading-5 text-warning">
                    Needs review later: {aiPlan.uncoveredAreas.join(" · ")}
                  </p>
                ) : null}
              </div>
              <RunConfigurationPanel
                projectId={selectedProject.id}
                environmentId={environmentId}
                catalogScenarios={catalogScenarios.map((scenario) => ({
                  id: scenario.id,
                  name: scenario.name,
                  detail: scenario.description || `${scenario.steps.length} saved steps`,
                  source: "CATALOG" as const,
                }))}
                systemScenarios={plan.scenarios.map((scenario) => ({
                  id: scenario.id,
                  name: scenario.name,
                  detail: scenario.expectedOutcome,
                  source: "SYSTEM" as const,
                }))}
                viewports={selectedViewports}
                roles={projectRoles}
                planLimit={2}
                busy={busy || waitingForProvider || !readyToStart}
                metadataLoading={configurationLoading}
                metadataError={configurationError}
                error={error}
                onStart={(payload) => void start(payload)}
              />
              <div className="border-t border-primary/20 pt-3 text-xs text-muted-foreground">
                The browser worker will run this fresh plan within your organization’s available
                capacity. Unused capacity is handled automatically after settlement.
              </div>
              {blockedPolicies.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {blockedPolicies.length} policy decision
                    {blockedPolicies.length === 1 ? "" : "s"} require review before this plan can
                    run. Open the advanced Discovery review to resolve them.
                  </span>
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          <footer className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"
            >
              Cancel
            </button>
            {phase === "idle" ? (
              <button
                type="submit"
                onClick={undefined}
                disabled={
                  busy ||
                  environments.length === 0 ||
                  !environmentId ||
                  !targetAuthorizationConfirmed
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                <>
                  <Radar className="h-4 w-4" /> Prepare browser test
                </>
              </button>
            ) : phase !== "ready" ? (
              <span className="inline-flex items-center gap-2 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === "starting" ? "Reserving and starting…" : "Preparing…"}
              </span>
            ) : null}
          </footer>
        </form>
      </div>
    </div>
  );
}
