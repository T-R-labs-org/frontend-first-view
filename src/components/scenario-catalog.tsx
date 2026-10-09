import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  GripVertical,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  ApiRequestError,
  organizationsApi,
  projectsApi,
  scenariosApi,
  workspacesApi,
  v2Api,
  type CreateScenarioPayload,
  type EnvironmentSecretMetadata,
  type Project,
  type ScenarioCatalogItem,
  type ScenarioStep,
} from "@/lib/api-client";
import { useLivePortfolio } from "@/lib/live-data";

const ACTIVE_ORG_KEY = "matrix_qa_active_organization";
const ACTIVE_WORKSPACE_KEY = "matrix_qa_active_workspace";
const ACTIVE_PROJECT_KEY = "matrix_qa_active_project";
const SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "CreateScenarioPayload",
  type: "object",
  additionalProperties: false,
  required: ["projectId", "name", "steps"],
  properties: {
    projectId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1, maxLength: 160 },
    description: { type: "string", maxLength: 2000 },
    steps: { type: "array", minItems: 1, maxItems: 20 },
  },
};
const labels: Record<ScenarioStep["type"], string> = {
  NAVIGATE: "Navigate",
  CLICK: "Click",
  FILL: "Fill",
  WAIT_FOR_ELEMENT: "Wait for Element",
  ASSERT_URL: "Assert URL",
  ASSERT_VISIBLE: "Assert Visible",
};
type Draft = Omit<CreateScenarioPayload, "projectId">;
const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary";
const freshStep = (): ScenarioStep => ({ type: "NAVIGATE", path: "/" });
const toMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;
const DYNAMIC_VARIABLES = ["{{DYNAMIC_EMAIL}}", "{{DYNAMIC_FIRST_NAME}}", "{{DYNAMIC_LAST_NAME}}"];
const SECRET_TOKEN_PATTERN = /\{\{(SECRET_[A-Z0-9_]+)\}\}/g;

function secretKeysIn(value: string): string[] {
  return Array.from(value.matchAll(SECRET_TOKEN_PATTERN), (match) => match[1]);
}

function isScenarioStep(value: unknown): value is ScenarioStep {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.type === "NAVIGATE" || item.type === "ASSERT_URL")
    return (
      typeof item.path === "string" && item.path.startsWith("/") && !item.path.startsWith("//")
    );
  if (item.type === "CLICK" || item.type === "ASSERT_VISIBLE")
    return typeof item.selector === "string" && item.selector.trim().length > 0;
  if (item.type === "FILL")
    return (
      typeof item.selector === "string" &&
      item.selector.trim().length > 0 &&
      typeof item.text === "string"
    );
  return (
    item.type === "WAIT_FOR_ELEMENT" &&
    typeof item.selector === "string" &&
    item.selector.trim().length > 0 &&
    Number.isInteger(item.timeoutMs) &&
    Number(item.timeoutMs) >= 1 &&
    Number(item.timeoutMs) <= 120000
  );
}
function isScenarioStepList(value: unknown): value is ScenarioStep[] {
  return (
    Array.isArray(value) && value.length >= 1 && value.length <= 20 && value.every(isScenarioStep)
  );
}

export function ScenarioCatalogPage() {
  const live = useLivePortfolio();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [items, setItems] = useState<ScenarioCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScenarioCatalogItem | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgs = await organizationsApi.list();
        const org = orgs.find((x) => x.id === localStorage.getItem(ACTIVE_ORG_KEY)) ?? orgs[0];
        if (!org) return;
        localStorage.setItem(ACTIVE_ORG_KEY, org.id);
        const workspaces = await workspacesApi.list(org.id);
        const workspace =
          workspaces.find((x) => x.id === localStorage.getItem(ACTIVE_WORKSPACE_KEY)) ??
          workspaces[0];
        if (!workspace) return;
        localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id);
        const projects = await projectsApi.list(org.id, workspace.id);
        const selected =
          projects.find((x) => x.id === localStorage.getItem(ACTIVE_PROJECT_KEY)) ?? projects[0];
        if (cancelled) return;
        setProjects(projects);
        if (selected) {
          setProjectId(selected.id);
          localStorage.setItem(ACTIVE_PROJECT_KEY, selected.id);
        }
      } catch (cause) {
        if (!cancelled) setError(toMessage(cause, "Unable to load projects."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (live.projects.length === 0) return;
    setProjects(live.projects);
    if (live.activeProject?.id && live.activeProject.id !== projectId) setProjectId(live.activeProject.id);
  }, [live.projects, live.activeProject?.id, projectId]);
  const load = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setDataLoading(true);
    setError(null);
    try {
      setItems(await scenariosApi.list(projectId));
    } catch (cause) {
      setError(toMessage(cause, "Unable to load scenarios."));
    } finally {
      setDataLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);
  const selected = projects.find((item) => item.id === projectId);
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
            Scenario catalog
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold md:text-3xl">
            Reusable scenarios
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Author safe, project-scoped test journeys with approved structured actions. Scenarios
            are saved for reuse and are not executed from this page.
          </p>
        </div>
        <button
          onClick={() => {
            setNotice(null);
            setEditing(null);
            setOpen(true);
          }}
          disabled={!projectId}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create scenario
        </button>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/50 p-3">
        <label className="text-xs font-semibold text-muted-foreground">Project</label>
        <select
          value={projectId}
          onChange={(event) => live.setActiveProject(event.target.value)}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          {projects.length === 0 && <option value="">No projects available</option>}
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        {selected && (
          <span className="text-xs text-muted-foreground">
            {selected.description || "Project-scoped library"}
          </span>
        )}
      </div>
      {notice && (
        <p className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 max-w-full overflow-x-auto rounded-md border border-border bg-surface/40">
        {loading || dataLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scenarios…
          </div>
        ) : !projectId ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Choose a project to view its scenario catalog.
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-display font-semibold">No scenarios yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create the first structured scenario for this project.
            </p>
          </div>
        ) : (
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3">Verification</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-4 font-medium">
                    {item.name}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.description || "No description"}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs">{item.steps.length}</td>
                  <td className="px-4 py-4">
                    {item.isVerified ? (
                      <span
                        title="Verified by a successful Dry Run"
                        aria-label="Verified"
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300"
                      >
                        <Check className="h-3.5 w-3.5" /> Verified
                      </span>
                    ) : (
                      <span
                        title="Unverified — run Dry Run before saving edits"
                        aria-label="Unverified"
                        className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-300"
                      >
                        <TriangleAlert className="h-3.5 w-3.5" /> Unverified
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(item);
                        setOpen(true);
                      }}
                      className="mr-2 text-primary hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete scenario “${item.name}”?`)) return;
                        try {
                          await scenariosApi.remove(projectId, item.id);
                          setItems((current) =>
                            current.filter((candidate) => candidate.id !== item.id),
                          );
                        } catch (cause) {
                          setError(toMessage(cause, "Unable to delete scenario."));
                        }
                      }}
                      className="text-destructive hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && projectId && (
        <ScenarioBuilder
          projectId={projectId}
          initialItem={editing}
          onClose={() => setOpen(false)}
          onCreated={(item) => {
            setItems((current) =>
              editing
                ? current.map((candidate) => (candidate.id === item.id ? item : candidate))
                : [item, ...current],
            );
            setOpen(false);
            setEditing(null);
            setNotice(`Scenario “${item.name}” saved.`);
          }}
        />
      )}
    </div>
  );
}

function ScenarioBuilder({
  projectId,
  initialItem,
  onClose,
  onCreated,
}: {
  projectId: string;
  initialItem: ScenarioCatalogItem | null;
  onClose: () => void;
  onCreated: (item: ScenarioCatalogItem) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    initialItem
      ? {
          name: initialItem.name,
          description: initialItem.description ?? "",
          steps: initialItem.steps,
        }
      : { name: "", description: "", steps: [freshStep()] },
  );
  const [prompt, setPrompt] = useState("");
  const [showGenerator, setShowGenerator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discoveryMapMissing, setDiscoveryMapMissing] = useState(false);
  const [environments, setEnvironments] = useState<Array<{ id: string; name: string }>>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState("");
  const [environmentSecrets, setEnvironmentSecrets] = useState<EnvironmentSecretMetadata[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [variablesOpen, setVariablesOpen] = useState<number | null>(null);
  const [verification, setVerification] = useState<{
    status: "queued" | "passed" | "failed";
    results: Array<{ index: number; status: "passed" | "failed"; error?: string }>;
    error: string | null;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const payload = useMemo(
    () => ({ projectId, ...draft, ...(draft.description ? {} : { description: undefined }) }),
    [projectId, draft],
  );
  useEffect(() => {
    let cancelled = false;
    void v2Api
      .listEnvironments(projectId)
      .then((items) => {
        if (cancelled) return;
        const available = items
          .filter((item) => !item.archivedAt)
          .map((item) => ({ id: item.id, name: item.name }));
        setEnvironments(available);
        setActiveEnvironmentId((current) =>
          current && available.some((item) => item.id === current)
            ? current
            : (available[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (!cancelled) setSecretsError("Unable to load environments for variables.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  useEffect(() => {
    if (!activeEnvironmentId) {
      setEnvironmentSecrets([]);
      return;
    }
    let cancelled = false;
    setSecretsLoading(true);
    setSecretsError(null);
    void v2Api
      .listEnvironmentSecrets(activeEnvironmentId)
      .then((items) => {
        if (!cancelled) setEnvironmentSecrets(items);
      })
      .catch(() => {
        if (!cancelled) {
          setEnvironmentSecrets([]);
          setSecretsError("Unable to load environment secret keys.");
        }
      })
      .finally(() => {
        if (!cancelled) setSecretsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeEnvironmentId]);
  const updateStep = (index: number, step: ScenarioStep) => (
    setVerification(null),
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((item, itemIndex) => (itemIndex === index ? step : item)),
    }))
  );
  const validate = () => {
    if (!draft.name.trim()) return "Scenario name is required.";
    if (draft.steps.length < 1) return "Add at least one step.";
    for (const step of draft.steps) {
      if (
        (step.type === "NAVIGATE" || step.type === "ASSERT_URL") &&
        (!step.path.startsWith("/") || step.path.startsWith("//"))
      )
        return "Paths must be relative and begin with /.";
      if (
        (step.type === "CLICK" ||
          step.type === "FILL" ||
          step.type === "WAIT_FOR_ELEMENT" ||
          step.type === "ASSERT_VISIBLE") &&
        !step.selector.trim()
      )
        return "Selectors must not be blank.";
      if (
        step.type === "WAIT_FOR_ELEMENT" &&
        (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1 || step.timeoutMs > 120000)
      )
        return "Timeout must be an integer from 1 to 120000 ms.";
      if (
        step.type === "FILL" &&
        secretKeysIn(step.text).some(
          (key) => !new Set(environmentSecrets.map((item) => item.key)).has(key),
        )
      )
        return "Secret key not found in active environment.";
    }
    return null;
  };
  const generate = async () => {
    if (prompt.trim().length < 3) {
      setError("Describe what you want to test first.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await scenariosApi.generate(projectId, { projectId, prompt: prompt.trim() });
      if (!isScenarioStepList(result.steps))
        throw new Error("The AI returned unsupported scenario steps. Nothing was changed.");
      setDiscoveryMapMissing(result.discoveryMapMissing);
      setVerification(null);
      setDraft((current) => ({ ...current, steps: result.steps }));
      setShowGenerator(false);
      setPrompt("");
    } catch (cause) {
      setError(toMessage(cause, "Unable to generate scenario steps. Your draft is still here."));
    } finally {
      setGenerating(false);
    }
  };
  const verify = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const result = await scenariosApi.verify(
        projectId,
        draft.steps,
        activeEnvironmentId || undefined,
      );
      let completed = result;
      for (let attempt = 0; attempt < 60 && completed.status === "queued"; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        if (!result.jobId) break;
        completed = await scenariosApi.getVerification(projectId, result.jobId);
      }
      setVerification({
        status: completed.status,
        results: completed.results,
        error: completed.error,
      });
      if (completed.status !== "passed")
        setError(
          completed.error || "Dry Run failed. Edit the step and verify again before saving.",
        );
    } catch (cause) {
      setVerification({
        status: "failed",
        results: [],
        error: toMessage(cause, "Unable to complete Dry Run."),
      });
      setError(toMessage(cause, "Unable to complete Dry Run."));
    } finally {
      setVerifying(false);
    }
  };
  const save = async () => {
    const issue = validate();
    if (issue) {
      setError(issue);
      return;
    }
    if (verification?.status === "failed") {
      setError("Dry Run failed. Edit or regenerate the steps, then verify again before saving.");
      return;
    }
    if (verification?.status !== "passed") {
      setError("Run Verify (Dry Run) successfully before saving this scenario.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const savePayload = {
        ...payload,
        ...(verification?.status === "passed" ? { isVerified: true } : {}),
      };
      onCreated(
        initialItem
          ? await scenariosApi.update(projectId, initialItem.id, savePayload)
          : await scenariosApi.create(projectId, savePayload),
      );
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError && cause.status === 409
          ? "A scenario with this name already exists in this project. Please choose a different name."
          : toMessage(cause, "Unable to save scenario. Your draft is still here."),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-5xl rounded-lg border border-border bg-surface p-5 shadow-2xl md:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              Structured action builder
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">Create scenario</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close builder"
            className="rounded-md p-2 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-semibold">Need a starting point?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Describe the journey and review every generated step before saving.
            </p>
          </div>
          <button
            onClick={() => setShowGenerator((current) => !current)}
            disabled={generating || saving}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </button>
        </div>
        {discoveryMapMissing && (
          <p className="mt-2 text-xs text-muted-foreground">
            Tip: Run Discovery on this project first for high-accuracy selector generation.
          </p>
        )}
        {showGenerator && (
          <div className="mt-3 rounded-md border border-border bg-surface-2/30 p-3">
            <label className="text-sm font-medium">
              What do you want to test?
              <input
                autoFocus
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={4000}
                placeholder="Test my /login page with a wrong password"
                className={`${inputClass} mt-1`}
              />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setShowGenerator(false)}
                disabled={generating}
                className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() => void generate()}
                disabled={generating || prompt.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Generate steps
              </button>
            </div>
          </div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium">
            Scenario name
            <input
              value={draft.name}
              onChange={(event) => {
                setVerification(null);
                setDraft({ ...draft, name: event.target.value });
              }}
              maxLength={160}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm font-medium">
            Description <span className="font-normal text-muted-foreground">(optional)</span>
            <input
              value={draft.description}
              onChange={(event) => {
                setVerification(null);
                setDraft({ ...draft, description: event.target.value });
              }}
              maxLength={2000}
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-display font-semibold">Steps</h3>
              <span
                className={`font-mono text-xs ${draft.steps.length >= 20 ? "text-amber-300" : "text-muted-foreground"}`}
              >
                {draft.steps.length} / 20 steps
              </span>
            </div>
            <button
              onClick={() => {
                setVerification(null);
                setDraft({ ...draft, steps: [...draft.steps, freshStep()] });
              }}
              disabled={generating || saving || draft.steps.length >= 20}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add step
            </button>
          </div>
          {draft.steps.length >= 20 && (
            <p className="text-xs text-amber-300">
              Maximum 20 steps per scenario. Focus on the requested route or feature.
            </p>
          )}
          {draft.steps.map((step, index) => (
            <div key={index}>
              <StepEditor
                index={index}
                step={step}
                canRemove={draft.steps.length > 1}
                disabled={generating || saving || verifying}
                environments={environments}
                activeEnvironmentId={activeEnvironmentId}
                onActiveEnvironmentChange={setActiveEnvironmentId}
                environmentSecrets={environmentSecrets}
                secretsLoading={secretsLoading}
                secretsError={secretsError}
                variablesOpen={variablesOpen === index}
                onVariablesOpenChange={(open) => setVariablesOpen(open ? index : null)}
                onChange={(next) => updateStep(index, next)}
                onRemove={() => {
                  setVerification(null);
                  setDraft({
                    ...draft,
                    steps: draft.steps.filter((_, itemIndex) => itemIndex !== index),
                  });
                }}
              />
              {verification?.results.find((result) => result.index === index) &&
                (() => {
                  const result = verification.results.find(
                    (candidate) => candidate.index === index,
                  )!;
                  return (
                    <div
                      className={`mt-2 flex items-start gap-2 text-xs ${result.status === "passed" ? "text-emerald-400" : "text-destructive"}`}
                    >
                      {result.status === "passed" ? (
                        <Check className="mt-0.5 h-4 w-4" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4" />
                      )}
                      <span>{result.status === "passed" ? "Verified" : result.error}</span>
                    </div>
                  );
                })()}
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payload preview
            </h3>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-black/20 p-3 text-xs leading-5">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              JSON Schema
            </h3>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-black/20 p-3 text-xs leading-5">
              {JSON.stringify(SCHEMA, null, 2)}
            </pre>
          </div>
        </div>
        {error && (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={generating || saving}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void verify()}
            disabled={generating || saving || verifying}
            className="inline-flex items-center gap-2 rounded-md border border-primary/40 px-4 py-2 text-sm font-semibold text-primary disabled:opacity-50"
          >
            {verifying && <Loader2 className="h-4 w-4 animate-spin" />}Verify (Dry Run)
          </button>
          <button
            onClick={() => void save()}
            disabled={generating || saving || verifying || verification?.status !== "passed"}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Save scenario
          </button>
        </div>
      </div>
    </div>
  );
}

function StepEditor({
  index,
  step,
  canRemove,
  disabled,
  environments,
  activeEnvironmentId,
  onActiveEnvironmentChange,
  environmentSecrets,
  secretsLoading,
  secretsError,
  variablesOpen,
  onVariablesOpenChange,
  onChange,
  onRemove,
}: {
  index: number;
  step: ScenarioStep;
  canRemove: boolean;
  disabled: boolean;
  environments: Array<{ id: string; name: string }>;
  activeEnvironmentId: string;
  onActiveEnvironmentChange: (value: string) => void;
  environmentSecrets: EnvironmentSecretMetadata[];
  secretsLoading: boolean;
  secretsError: string | null;
  variablesOpen: boolean;
  onVariablesOpenChange: (open: boolean) => void;
  onChange: (step: ScenarioStep) => void;
  onRemove: () => void;
}) {
  const field = (
    label: string,
    value: string | number,
    change: (value: string) => void,
    type = "text",
  ) => (
    <label className="text-xs font-medium">
      {label}
      <input
        disabled={disabled}
        type={type}
        value={value}
        onChange={(event) => change(event.target.value)}
        className={`${inputClass} mt-1 disabled:opacity-60`}
      />
    </label>
  );
  return (
    <div className="rounded-md border border-border bg-surface-2/30 p-3">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <select
          disabled={disabled}
          value={step.type}
          onChange={(event) => {
            const type = event.target.value as ScenarioStep["type"];
            onChange(
              type === "NAVIGATE" || type === "ASSERT_URL"
                ? { type, path: "/" }
                : type === "FILL"
                  ? { type, selector: "", text: "" }
                  : type === "WAIT_FOR_ELEMENT"
                    ? { type, selector: "", timeoutMs: 5000 }
                    : { type, selector: "" },
            );
          }}
          className="ml-2 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm disabled:opacity-60"
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          disabled={!canRemove || disabled}
          aria-label={`Remove step ${index + 1}`}
          className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {(step.type === "NAVIGATE" || step.type === "ASSERT_URL") &&
          field(
            step.type === "NAVIGATE" ? "Relative URL" : "Expected relative URL",
            step.path,
            (value) => onChange({ ...step, path: value }),
          )}
        {(step.type === "CLICK" || step.type === "ASSERT_VISIBLE") &&
          field("Element selector", step.selector, (value) =>
            onChange({ ...step, selector: value }),
          )}
        {step.type === "FILL" && (
          <>
            {field("Element selector", step.selector, (value) =>
              onChange({ ...step, selector: value }),
            )}
            <label className="relative text-xs font-medium">
              <span className="flex items-center justify-between gap-2">
                <span>Text</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onVariablesOpenChange(!variablesOpen)}
                  className="rounded border border-primary/40 px-2 py-1 font-mono text-[10px] text-primary hover:bg-primary/10 disabled:opacity-50"
                  aria-expanded={variablesOpen}
                  aria-haspopup="menu"
                >
                  &#123;x&#125; Variables
                </button>
              </span>
              <input
                disabled={disabled}
                type="text"
                value={step.text}
                onChange={(event) => onChange({ ...step, text: event.target.value })}
                className={`${inputClass} mt-1 disabled:opacity-60`}
                aria-describedby={
                  secretKeysIn(step.text).some(
                    (key) => !environmentSecrets.some((item) => item.key === key),
                  )
                    ? `secret-warning-${index}`
                    : undefined
                }
              />
              {secretKeysIn(step.text).some(
                (key) => !environmentSecrets.some((item) => item.key === key),
              ) && (
                <span
                  id={`secret-warning-${index}`}
                  className="mt-1 block text-[11px] text-warning"
                >
                  Secret key not found in active environment.
                </span>
              )}
              {variablesOpen && (
                <div
                  className="absolute right-0 top-14 z-20 w-80 rounded-md border border-border bg-surface p-3 shadow-xl"
                  role="menu"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Dynamic Data
                  </p>
                  <div className="mt-1 grid gap-1">
                    {DYNAMIC_VARIABLES.map((token) => (
                      <button
                        key={token}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          onChange({ ...step, text: `${step.text}${token}` });
                          onVariablesOpenChange(false);
                        }}
                        className="rounded px-2 py-1.5 text-left font-mono text-xs hover:bg-accent"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Environment Secrets
                      </p>
                      {environments.length > 0 && (
                        <select
                          value={activeEnvironmentId}
                          onChange={(event) => onActiveEnvironmentChange(event.target.value)}
                          className="max-w-[9rem] rounded border border-border bg-surface-2 px-1.5 py-1 text-[10px]"
                          aria-label="Active environment for secret variables"
                        >
                          {environments.map((environment) => (
                            <option key={environment.id} value={environment.id}>
                              {environment.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    {secretsLoading ? (
                      <p className="mt-2 text-xs text-muted-foreground">Loading secret keys…</p>
                    ) : secretsError ? (
                      <p className="mt-2 text-xs text-warning">{secretsError}</p>
                    ) : environmentSecrets.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        No secret keys in this environment.
                      </p>
                    ) : (
                      <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto">
                        {environmentSecrets.map((secret) => {
                          const token = `{{${secret.key}}}`;
                          return (
                            <button
                              key={secret.id}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onChange({ ...step, text: `${step.text}${token}` });
                                onVariablesOpenChange(false);
                              }}
                              className="rounded px-2 py-1.5 text-left font-mono text-xs hover:bg-accent"
                            >
                              {token}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </label>
          </>
        )}
        {step.type === "WAIT_FOR_ELEMENT" && (
          <>
            {field("Element selector", step.selector, (value) =>
              onChange({ ...step, selector: value }),
            )}
            {field(
              "Timeout (ms)",
              step.timeoutMs,
              (value) => onChange({ ...step, timeoutMs: Number(value) }),
              "number",
            )}
          </>
        )}
      </div>
    </div>
  );
}
