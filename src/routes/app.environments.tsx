import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Archive,
  CheckCircle2,
  Database,
  GitCompareArrows,
  KeyRound,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  TestTube2,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  organizationsApi,
  projectsApi,
  v2Api,
  workspacesApi,
  type Organization,
  type Project,
  type V2Environment,
  type V2EnvironmentDependency,
  type V2DependencyKind,
  type V2EnvironmentSnapshot,
  type EnvironmentSecretMetadata,
  type EnvironmentHttpHeaderWrite,
  type V2FixtureStrategy,
  type V2TestDataFixture,
  type Workspace,
} from "@/lib/api-client";
import { RoleManagementPanel } from "@/components/role-management-panel";

const ACTIVE_ORG_KEY = "matrix_qa_active_organization";
const ACTIVE_WORKSPACE_KEY = "matrix_qa_active_workspace";
const ACTIVE_PROJECT_KEY = "matrix_qa_active_project";

type Panel = "environment" | "fixture" | null;

export const Route = createFileRoute("/app/environments")({
  head: () => ({
    meta: [{ title: "Secrets & environments · Matrix QA" }, { name: "robots", content: "noindex" }],
  }),
  component: EnvironmentsPage,
});

function EnvironmentsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<V2Environment[]>([]);
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<V2TestDataFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [editingEnvironment, setEditingEnvironment] = useState<V2Environment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    organizationsApi
      .list()
      .then((items) => {
        if (cancelled) return;
        setOrganizations(items);
        const stored = localStorage.getItem(ACTIVE_ORG_KEY);
        const selected = items.find((item) => item.id === stored) ?? items[0];
        setOrganizationId(selected?.id ?? null);
        if (selected) localStorage.setItem(ACTIVE_ORG_KEY, selected.id);
      })
      .catch((cause) => {
        if (!cancelled) setError(toMessage(cause, "Unable to load organizations."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setWorkspaces([]);
      setWorkspaceId(null);
      return;
    }
    let cancelled = false;
    workspacesApi
      .list(organizationId)
      .then((items) => {
        if (cancelled) return;
        setWorkspaces(items);
        const stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
        const selected = items.find((item) => item.id === stored) ?? items[0];
        setWorkspaceId(selected?.id ?? null);
        if (selected) localStorage.setItem(ACTIVE_WORKSPACE_KEY, selected.id);
      })
      .catch((cause) => {
        if (!cancelled) setError(toMessage(cause, "Unable to load workspaces."));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId || !workspaceId) {
      setProjects([]);
      setProjectId(null);
      return;
    }
    let cancelled = false;
    projectsApi
      .list(organizationId, workspaceId)
      .then((items) => {
        if (cancelled) return;
        setProjects(items);
        const stored = localStorage.getItem(ACTIVE_PROJECT_KEY);
        const selected = items.find((item) => item.id === stored) ?? items[0];
        setProjectId(selected?.id ?? null);
        if (selected) localStorage.setItem(ACTIVE_PROJECT_KEY, selected.id);
      })
      .catch((cause) => {
        if (!cancelled) setError(toMessage(cause, "Unable to load projects."));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, workspaceId]);

  const loadProjectData = useCallback(async () => {
    if (!projectId) {
      setEnvironments([]);
      setFixtures([]);
      return;
    }
    setLoadingData(true);
    setError(null);
    try {
      const [environmentItems, fixtureItems] = await Promise.all([
        v2Api.listEnvironments(projectId),
        v2Api.listTestDataFixtures(projectId),
      ]);
      setEnvironments(environmentItems);
      setActiveEnvironmentId((current) =>
        current && environmentItems.some((item) => item.id === current)
          ? current
          : (environmentItems[0]?.id ?? null),
      );
      setFixtures(fixtureItems);
    } catch (cause) {
      setError(toMessage(cause, "Unable to load environment and test-data records."));
    } finally {
      setLoadingData(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadProjectData();
  }, [loadProjectData]);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId],
  );
  const handleScopeChange = (kind: "organization" | "workspace" | "project", value: string) => {
    setError(null);
    setNotice(null);
    setPanel(null);
    if (kind === "organization") {
      setOrganizationId(value);
      localStorage.setItem(ACTIVE_ORG_KEY, value);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    if (kind === "workspace") {
      setWorkspaceId(value);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, value);
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    if (kind === "project") {
      setProjectId(value);
      localStorage.setItem(ACTIVE_PROJECT_KEY, value);
    }
  };

  const onEnvironmentCreated = (item: V2Environment) => {
    setEnvironments((current) => [item, ...current]);
    setPanel(null);
    setNotice(`Environment “${item.name}” created. Run a health check before trusting it.`);
  };
  const onEnvironmentSaved = (item: V2Environment) => {
    setEnvironments((current) =>
      current.some((environment) => environment.id === item.id)
        ? current.map((environment) => (environment.id === item.id ? item : environment))
        : [item, ...current],
    );
    setEditingEnvironment(null);
    setPanel(null);
    setNotice(`Environment “${item.name}” updated.`);
  };
  const onFixtureCreated = (item: V2TestDataFixture) => {
    setFixtures((current) => [item, ...current]);
    setPanel(null);
    setNotice(
      `Fixture “${item.name}” created as ${item.status.toLowerCase()}. Validate its contract before using it.`,
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              Secrets &amp; environments
            </h1>
            <span className="rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 font-mono text-[10px] text-primary">
              CONTROL PLANE
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Choose the exact target and data contract before a run. Matrix QA stores metadata and
            masked field names only; it never asks you to paste credentials or customer data here.
          </p>
        </div>
        {projectId && (
          <button
            type="button"
            onClick={() => void loadProjectData()}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} /> Refresh
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-3 rounded-xl border border-border bg-surface/40 p-4 md:grid-cols-3">
        <ScopeSelect
          label="Organization"
          value={organizationId ?? ""}
          items={organizations.map((item) => ({ id: item.id, name: item.name }))}
          onChange={(value) => handleScopeChange("organization", value)}
          disabled={loading}
          empty="No organization"
        />
        <ScopeSelect
          label="Workspace"
          value={workspaceId ?? ""}
          items={workspaces.map((item) => ({ id: item.id, name: item.name }))}
          onChange={(value) => handleScopeChange("workspace", value)}
          disabled={!organizationId}
          empty="No workspace"
        />
        <ScopeSelect
          label="Project"
          value={projectId ?? ""}
          items={projects.map((item) => ({ id: item.id, name: item.name }))}
          onChange={(value) => handleScopeChange("project", value)}
          disabled={!workspaceId}
          empty="No project"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-4 rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          {notice}
        </div>
      )}
      {!projectId && !loading && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-12 text-center">
          <Database className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-4 font-display text-xl font-semibold">Choose a project first</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Environment and test-data records are always project-scoped so one customer’s target or
            fixture can never appear in another project.
          </p>
        </div>
      )}

      {projectId && (
        <>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <section className="surface-card overflow-hidden">
              <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-lg font-semibold">Environments</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Saved target contexts with same-origin health checks.{" "}
                    {selectedProject?.name ?? ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingEnvironment(null);
                    setPanel("environment");
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </header>
              <div className="divide-y divide-border">
                {loadingData ? (
                  <LoadingRow label="Loading environments…" />
                ) : environments.length === 0 ? (
                  <EmptyRow
                    label="No environments configured yet."
                    hint="Add staging or preview so runs use an explicit target context."
                  />
                ) : (
                  environments.map((environment) => (
                    <EnvironmentRow
                      key={environment.id}
                      environment={environment}
                      onHealthChecked={(updated) =>
                        setEnvironments((current) =>
                          current.map((item) => (item.id === updated.id ? updated : item)),
                        )
                      }
                      onError={setError}
                      onEdit={(item) => {
                        setEditingEnvironment(item);
                        setPanel("environment");
                      }}
                      onArchived={(environmentId) =>
                        setEnvironments((current) =>
                          current.filter((item) => item.id !== environmentId),
                        )
                      }
                    />
                  ))
                )}
              </div>
            </section>
            <section className="surface-card overflow-hidden">
              <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <TestTube2 className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-lg font-semibold">Test-data fixtures</h2>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Reusable data contracts, masked-field declarations, and lifecycle readiness.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel("fixture")}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </header>
              <div className="divide-y divide-border">
                {loadingData ? (
                  <LoadingRow label="Loading fixtures…" />
                ) : fixtures.length === 0 ? (
                  <EmptyRow
                    label="No test-data fixtures configured yet."
                    hint="Start with a manual fixture such as “new customer, empty cart”."
                  />
                ) : (
                  fixtures.map((fixture) => (
                    <FixtureRow
                      key={fixture.id}
                      fixture={fixture}
                      onUpdated={(updated) =>
                        setFixtures((current) =>
                          current.map((item) => (item.id === updated.id ? updated : item)),
                        )
                      }
                      onError={setError}
                    />
                  ))
                )}
              </div>
            </section>
          </div>
          {environments.length > 0 && projectId && (
            <div className="mt-5">
              <label
                className="mb-2 block text-xs font-medium text-muted-foreground"
                htmlFor="active-role-environment"
              >
                Active environment for role management
              </label>
              <select
                id="active-role-environment"
                value={activeEnvironmentId ?? ""}
                onChange={(event) => setActiveEnvironmentId(event.target.value)}
                className="rounded-md border border-border bg-surface-2/30 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Select environment
                </option>
                {environments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.kind}
                  </option>
                ))}
              </select>
              <RoleManagementPanel
                projectId={projectId}
                environment={
                  environments.find((item) => item.id === activeEnvironmentId) ?? environments[0]
                }
              />
            </div>
          )}
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              <strong className="text-foreground">Safety boundary:</strong> this first control-plane
              version stores declarative metadata only. It does not execute arbitrary SQL, accept
              raw secrets, or mutate a customer database from the browser. HTTP-hook and snapshot
              fixtures must be wired to an approved backend integration before lifecycle actions are
              enabled.
            </p>
          </div>
        </>
      )}

      {panel === "environment" && projectId && organizationId && workspaceId && (
        <EnvironmentDrawer
          organizationId={organizationId}
          workspaceId={workspaceId}
          projectId={projectId}
          environment={editingEnvironment}
          onClose={() => setPanel(null)}
          onSaved={editingEnvironment ? onEnvironmentSaved : onEnvironmentCreated}
        />
      )}
      {panel === "fixture" && projectId && (
        <FixtureDrawer
          projectId={projectId}
          environments={environments}
          onClose={() => setPanel(null)}
          onCreated={onFixtureCreated}
        />
      )}
    </div>
  );
}

function ScopeSelect({
  label,
  value,
  items,
  onChange,
  disabled,
  empty,
}: {
  label: string;
  value: string;
  items: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  empty: string;
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || items.length === 0}
        className="mt-1.5 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
      >
        {items.length === 0 && <option value="">{empty}</option>}
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function EnvironmentRow({
  environment,
  onHealthChecked,
  onError,
  onEdit,
  onArchived,
}: {
  environment: V2Environment;
  onHealthChecked: (environment: V2Environment) => void;
  onError: (message: string) => void;
  onEdit: (environment: V2Environment) => void;
  onArchived: (environmentId: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dependencies, setDependencies] = useState<V2EnvironmentDependency[]>([]);
  const [snapshots, setSnapshots] = useState<V2EnvironmentSnapshot[]>([]);
  const [drift, setDrift] = useState<"NO_BASELINE" | "IN_SYNC" | "DRIFTED" | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [dependencyName, setDependencyName] = useState("");
  const [dependencyPath, setDependencyPath] = useState("/health");
  const [dependencyKind, setDependencyKind] = useState<
    "HTTP" | "DATABASE" | "QUEUE" | "EMAIL" | "PAYMENT" | "OTHER"
  >("HTTP");
  const [editingDependencyId, setEditingDependencyId] = useState<string | null>(null);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<EnvironmentSecretMetadata[]>([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretFormOpen, setSecretFormOpen] = useState(false);
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [rotatingKey, setRotatingKey] = useState<string | null>(null);
  const health = environment.healthStatus ?? "UNKNOWN";

  const loadDetails = async () => {
    setDetailsLoading(true);
    try {
      const [dependencyItems, snapshotItems, driftResult] = await Promise.all([
        v2Api.listDependencies(environment.id),
        v2Api.listSnapshots(environment.id),
        v2Api.getEnvironmentDrift(environment.id),
      ]);
      setDependencies(dependencyItems);
      setSnapshots(snapshotItems);
      setDrift(driftResult.status);
    } catch (cause) {
      onError(toMessage(cause, "Unable to load environment controls."));
    } finally {
      setDetailsLoading(false);
    }
  };

  const check = async () => {
    setChecking(true);
    onError("");
    try {
      const result = await v2Api.checkEnvironmentHealth(environment.id);
      onHealthChecked(result.environment);
      if (expanded) await loadDetails();
    } catch (cause) {
      onError(toMessage(cause, "Environment health check failed."));
    } finally {
      setChecking(false);
    }
  };

  const loadSecrets = async () => {
    setSecretsLoading(true);
    setSecretError(null);
    try {
      setSecrets(await v2Api.listEnvironmentSecrets(environment.id));
    } catch (cause) {
      setSecretError(toMessage(cause, "Unable to load secret metadata."));
    } finally {
      setSecretsLoading(false);
    }
  };

  const openSecretForm = (key?: string) => {
    setRotatingKey(key ?? null);
    setSecretKey(key ?? "SECRET_");
    setSecretValue("");
    setSecretError(null);
    setSecretFormOpen(true);
  };

  const normalizeSecretKeyInput = (value: string) => {
    const compact = value
      .toUpperCase()
      .replace(/\s/g, "")
      .replace(/[^A-Z0-9_]/g, "");
    return compact.startsWith("SECRET_") ? compact : `SECRET_${compact.replace(/^SECRET_?/, "")}`;
  };

  const saveSecret = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedKey = normalizeSecretKeyInput(secretKey);
    if (!/^SECRET_[A-Z0-9_]{1,120}$/.test(normalizedKey)) {
      setSecretError(
        "Key must start with SECRET_ and contain only uppercase letters, numbers, and underscores.",
      );
      return;
    }
    if (!secretValue || /\s/.test(secretValue)) {
      setSecretError("Secret value is required and cannot contain spaces.");
      return;
    }
    setAction("secret");
    setSecretError(null);
    try {
      if (rotatingKey)
        await v2Api.rotateEnvironmentSecret(environment.id, rotatingKey, secretValue);
      else
        await v2Api.createEnvironmentSecret(environment.id, {
          key: normalizedKey,
          value: secretValue,
        });
      setSecretFormOpen(false);
      setSecretValue("");
      setSecretKey("");
      setRotatingKey(null);
      await loadSecrets();
    } catch (cause) {
      setSecretError(toMessage(cause, "Unable to save secret."));
    } finally {
      setAction(null);
    }
  };

  const deleteSecret = async (key: string) => {
    if (!window.confirm(`Delete secret “${key}”? This cannot be undone.`)) return;
    setAction(`delete-secret-${key}`);
    setSecretError(null);
    try {
      await v2Api.deleteEnvironmentSecret(environment.id, key);
      setSecrets((current) => current.filter((item) => item.key !== key));
    } catch (cause) {
      setSecretError(toMessage(cause, "Unable to delete secret."));
    } finally {
      setAction(null);
    }
  };

  const toggleDetails = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && dependencies.length === 0 && snapshots.length === 0 && !drift) void loadDetails();
    if (next && secrets.length === 0 && !secretsLoading) void loadSecrets();
  };

  const addDependency = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dependencyName.trim() || !dependencyPath.trim()) return;
    setAction("dependency");
    onError("");
    try {
      if (editingDependencyId) {
        const updated = await v2Api.updateDependency(editingDependencyId, {
          name: dependencyName.trim(),
          kind: dependencyKind,
          checkPath: dependencyPath.trim(),
          expectedStatus: 200,
        });
        setDependencies((current) =>
          current
            .map((item) => (item.id === updated.id ? updated : item))
            .sort((left, right) => left.name.localeCompare(right.name)),
        );
      } else {
        const created = await v2Api.createDependency({
          environmentId: environment.id,
          name: dependencyName.trim(),
          kind: dependencyKind,
          checkPath: dependencyPath.trim(),
          expectedStatus: 200,
        });
        setDependencies((current) =>
          [...current, created].sort((left, right) => left.name.localeCompare(right.name)),
        );
      }
      setDependencyName("");
      setDependencyPath("/health");
      setDependencyKind("HTTP");
      setEditingDependencyId(null);
    } catch (cause) {
      onError(toMessage(cause, "Unable to add dependency."));
    } finally {
      setAction(null);
    }
  };

  const editDependency = (dependency: V2EnvironmentDependency) => {
    setEditingDependencyId(dependency.id);
    setDependencyName(dependency.name);
    setDependencyKind(dependency.kind as V2DependencyKind);
    setDependencyPath(dependency.checkPath);
  };

  const cancelDependencyEdit = () => {
    setEditingDependencyId(null);
    setDependencyName("");
    setDependencyKind("HTTP");
    setDependencyPath("/health");
  };

  const deleteDependency = async (dependency: V2EnvironmentDependency) => {
    if (!window.confirm(`Delete dependency “${dependency.name}”? This cannot be undone.`)) return;
    setAction(`delete-dependency-${dependency.id}`);
    onError("");
    try {
      await v2Api.deleteDependency(dependency.id);
      setDependencies((current) => current.filter((item) => item.id !== dependency.id));
      if (editingDependencyId === dependency.id) cancelDependencyEdit();
    } catch (cause) {
      onError(toMessage(cause, "Unable to delete dependency."));
    } finally {
      setAction(null);
    }
  };

  const checkDependencies = async () => {
    setAction("check-dependencies");
    onError("");
    try {
      await v2Api.checkAllDependencies(environment.id);
      await loadDetails();
    } catch (cause) {
      onError(toMessage(cause, "Dependency health checks failed."));
    } finally {
      setAction(null);
    }
  };

  const takeSnapshot = async () => {
    if (!snapshotLabel.trim()) return;
    setAction("snapshot");
    onError("");
    try {
      const snapshot = await v2Api.createSnapshot(environment.id, snapshotLabel.trim());
      setSnapshots((current) => [snapshot, ...current]);
      setDrift("IN_SYNC");
      setSnapshotLabel("");
    } catch (cause) {
      onError(toMessage(cause, "Unable to create environment snapshot."));
    } finally {
      setAction(null);
    }
  };

  const archive = async () => {
    if (!window.confirm(`Archive “${environment.name}”? Existing run history will remain intact.`))
      return;
    setAction("archive");
    onError("");
    try {
      await v2Api.archiveEnvironment(environment.id);
      onArchived(environment.id);
    } catch (cause) {
      onError(toMessage(cause, "Unable to archive environment."));
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${health === "HEALTHY" ? "bg-success" : health === "DEGRADED" ? "bg-warning" : health === "UNAVAILABLE" ? "bg-destructive" : "bg-muted-foreground"}`}
            />
            <span className="truncate text-sm font-medium">{environment.name}</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {environment.kind}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
            {environment.baseUrl}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Health: {health.toLowerCase()}{" "}
            {environment.lastHealthCheckedAt
              ? `· checked ${new Date(environment.lastHealthCheckedAt).toLocaleString()}`
              : "· not checked"}
          </div>
          {environment.lastHealthError && (
            <div className="mt-1 max-w-xl text-[11px] text-warning">
              {environment.lastHealthError}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(environment)}
            disabled={Boolean(action)}
            aria-label={`Edit ${environment.name}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button
            type="button"
            onClick={() => void check()}
            disabled={checking || Boolean(action)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}{" "}
            Check health
          </button>
          <button
            type="button"
            onClick={toggleDetails}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
          >
            {expanded ? "Hide controls" : "Manage"}
          </button>
          <button
            type="button"
            onClick={() => void archive()}
            disabled={Boolean(action)}
            aria-label={`Archive ${environment.name}`}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Archive className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-surface-2/20 p-4">
          {detailsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading dependency and baseline state…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Dependencies
                  </p>
                  <p className="mt-1 text-lg font-semibold">{dependencies.length}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {dependencies.filter((item) => item.status === "HEALTHY").length} healthy
                  </p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Snapshots
                  </p>
                  <p className="mt-1 text-lg font-semibold">{snapshots.length}</p>
                  <p className="text-[11px] text-muted-foreground">Last baseline retained</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Drift</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${drift === "DRIFTED" ? "text-warning" : drift === "IN_SYNC" ? "text-success" : "text-muted-foreground"}`}
                  >
                    {drift ? drift.replace("_", " ") : "Not checked"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Compared with latest snapshot</p>
                </div>
              </div>
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold">Dependency health</p>
                  <button
                    type="button"
                    onClick={() => void checkDependencies()}
                    disabled={action !== null || dependencies.length === 0}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
                  >
                    {action === "check-dependencies" && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}{" "}
                    Check all
                  </button>
                </div>
                {dependencies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No dependencies registered.</p>
                ) : (
                  <div className="space-y-1">
                    {dependencies.map((dependency) => (
                      <div
                        key={dependency.id}
                        className="flex items-center justify-between gap-2 rounded border border-border/70 px-2.5 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate">
                          <span
                            className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${dependency.status === "HEALTHY" ? "bg-success" : dependency.status === "DEGRADED" ? "bg-warning" : dependency.status === "UNAVAILABLE" ? "bg-destructive" : "bg-muted-foreground"}`}
                          />
                          {dependency.name}{" "}
                          <span className="text-muted-foreground">
                            · {dependency.kind} · {dependency.checkPath}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">
                            {dependency.lastLatencyMs
                              ? `${dependency.lastLatencyMs}ms`
                              : dependency.status.toLowerCase()}
                          </span>
                          <button
                            type="button"
                            onClick={() => editDependency(dependency)}
                            disabled={action !== null}
                            aria-label={`Edit dependency ${dependency.name}`}
                            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteDependency(dependency)}
                            disabled={action !== null}
                            aria-label={`Delete dependency ${dependency.name}`}
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                          >
                            {action === `delete-dependency-${dependency.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(event) => void addDependency(event)}
                  className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                >
                  <Field label={editingDependencyId ? "Edit dependency name" : "Dependency name"}>
                    <input
                      value={dependencyName}
                      onChange={(event) => setDependencyName(event.target.value)}
                      placeholder="Payment API"
                      disabled={action !== null}
                    />
                  </Field>
                  <Field label="Kind">
                    <select
                      value={dependencyKind}
                      onChange={(event) =>
                        setDependencyKind(event.target.value as typeof dependencyKind)
                      }
                      disabled={action !== null}
                    >
                      <option value="HTTP">HTTP</option>
                      <option value="DATABASE">Database</option>
                      <option value="QUEUE">Queue</option>
                      <option value="EMAIL">Email</option>
                      <option value="PAYMENT">Payment</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                  <Field label="Relative check path">
                    <input
                      value={dependencyPath}
                      onChange={(event) => setDependencyPath(event.target.value)}
                      placeholder="/health/payment"
                      disabled={action !== null}
                    />
                  </Field>
                  <button
                    type="submit"
                    disabled={action !== null || !dependencyName.trim()}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {action === "dependency" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{" "}
                    {editingDependencyId ? "Save" : "Add"}
                  </button>
                  {editingDependencyId && (
                    <button
                      type="button"
                      onClick={cancelDependencyEdit}
                      disabled={action !== null}
                      className="inline-flex items-center justify-center rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </form>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Snapshot label">
                  <input
                    value={snapshotLabel}
                    onChange={(event) => setSnapshotLabel(event.target.value)}
                    placeholder="Before release 2026.08"
                    disabled={action !== null}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => void takeSnapshot()}
                  disabled={action !== null || !snapshotLabel.trim()}
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-50"
                >
                  {action === "snapshot" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}{" "}
                  Save baseline
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span>
                  Snapshots retain configuration fingerprints and dependency metadata only.
                </span>
                <button
                  type="button"
                  onClick={() => void loadDetails()}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <GitCompareArrows className="h-3 w-3" /> Recalculate drift
                </button>
              </div>
              <section className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Secret Vault</h3>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSecretForm()}
                    className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground"
                  >
                    Add secret
                  </button>
                </div>
                {secretError && (
                  <p
                    role="alert"
                    className="mt-3 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
                  >
                    {secretError}
                  </p>
                )}
                {secretFormOpen && (
                  <form
                    onSubmit={(event) => void saveSecret(event)}
                    className="mt-3 grid gap-3 rounded-md border border-border bg-surface p-3"
                  >
                    <Field label="Key">
                      <input
                        value={secretKey}
                        onChange={(event) =>
                          setSecretKey(normalizeSecretKeyInput(event.target.value))
                        }
                        disabled={Boolean(rotatingKey) || action === "secret"}
                        placeholder="SECRET_ADMIN_TOKEN"
                        pattern="SECRET_[A-Z0-9_]{1,120}"
                        minLength={8}
                        maxLength={128}
                        required
                        autoComplete="off"
                        spellCheck={false}
                        aria-invalid={Boolean(secretError)}
                        className="block w-full rounded-md border border-border bg-background px-3 py-2.5 font-mono text-sm uppercase outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                      />
                    </Field>
                    <Field label="Value">
                      <input
                        type="password"
                        value={secretValue}
                        onChange={(event) => setSecretValue(event.target.value.replace(/\s/g, ""))}
                        disabled={action === "secret"}
                        pattern="\S+"
                        minLength={1}
                        maxLength={10000}
                        required
                        autoComplete="new-password"
                        aria-invalid={Boolean(secretError)}
                        className="block w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={action === "secret"}
                        className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {action === "secret" ? "Saving…" : rotatingKey ? "Rotate" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSecretFormOpen(false);
                          setSecretValue("");
                        }}
                        className="rounded-md border border-border px-3 py-2 text-xs hover:bg-accent"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {secretsLoading ? (
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading secret metadata…
                  </div>
                ) : secrets.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No secrets stored for this environment.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded border border-border">
                    <table className="w-full min-w-[34rem] text-left text-xs">
                      <thead className="border-b border-border bg-surface-2/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Key</th>
                          <th className="px-3 py-2">Value</th>
                          <th className="px-3 py-2">Last used</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {secrets.map((secret) => (
                          <tr key={secret.id} className="border-b border-border/60 last:border-0">
                            <td className="px-3 py-2 font-mono">{secret.key}</td>
                            <td className="px-3 py-2" aria-label="Value hidden">
                              ••••••••
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {secret.lastUsedAt
                                ? new Date(secret.lastUsedAt).toLocaleString()
                                : "Never"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => openSecretForm(secret.key)}
                                className="mr-2 text-primary hover:underline"
                              >
                                Rotate
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteSecret(secret.key)}
                                disabled={action === `delete-secret-${secret.key}`}
                                className="inline-flex items-center gap-1 text-destructive hover:underline disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" /> Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FixtureRow({
  fixture,
  onUpdated,
  onError,
}: {
  fixture: V2TestDataFixture;
  onUpdated: (fixture: V2TestDataFixture) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const validate = async () => {
    setBusy(true);
    onError("");
    try {
      const result = await v2Api.validateTestDataFixture(fixture.id);
      onUpdated(result.fixture);
    } catch (cause) {
      onError(toMessage(cause, "Fixture validation failed."));
    } finally {
      setBusy(false);
    }
  };
  const activate = async () => {
    setBusy(true);
    onError("");
    try {
      onUpdated(await v2Api.updateTestDataFixture(fixture.id, { status: "ACTIVE" }));
    } catch (cause) {
      onError(toMessage(cause, "Fixture could not be activated."));
    } finally {
      setBusy(false);
    }
  };
  const execute = async (operation: "seed" | "reset") => {
    if (
      !window.confirm(
        `Run ${operation} for “${fixture.name}”? This may mutate the configured test environment.`,
      )
    )
      return;
    setBusy(true);
    onError("");
    try {
      const result = await v2Api.executeTestDataFixture(fixture.id, operation, true);
      onUpdated(result.fixture);
    } catch (cause) {
      onError(toMessage(cause, `Fixture ${operation} failed.`));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${fixture.lastValidationStatus === "READY" ? "bg-success" : fixture.lastValidationStatus === "INVALID" ? "bg-destructive" : "bg-muted-foreground"}`}
          />
          <span className="truncate text-sm font-medium">{fixture.name}</span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
            {fixture.strategy.replace("_", " ")}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {fixture.description || "No description"} ·{" "}
          {fixture.maskedFields && Array.isArray(fixture.maskedFields)
            ? `${fixture.maskedFields.length} masked field${fixture.maskedFields.length === 1 ? "" : "s"}`
            : "No masked fields declared"}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Status: {fixture.status.toLowerCase()} · Contract:{" "}
          {(fixture.lastValidationStatus || "not validated").toLowerCase()}{" "}
          {fixture.lastExecutionStatus ? `· Last ${fixture.lastExecutionStatus.toLowerCase()}` : ""}
        </div>
        {fixture.lastValidationError && (
          <div className="mt-1 max-w-xl text-[11px] text-destructive">
            {fixture.lastValidationError}
          </div>
        )}
        {fixture.lastExecutionError && (
          <div className="mt-1 max-w-xl text-[11px] text-warning">{fixture.lastExecutionError}</div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void validate()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}{" "}
          Validate
        </button>
        {fixture.status === "DRAFT" && fixture.lastValidationStatus === "READY" && (
          <button
            type="button"
            onClick={() => void activate()}
            disabled={busy}
            className="rounded-md border border-primary/30 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            Activate
          </button>
        )}
        {fixture.status === "ACTIVE" &&
          fixture.strategy === "HTTP_HOOK" &&
          fixture.lastValidationStatus === "READY" && (
            <>
              <button
                type="button"
                onClick={() => void execute("seed")}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Play className="h-3 w-3" /> Seed
              </button>
              <button
                type="button"
                onClick={() => void execute("reset")}
                disabled={busy}
                className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
              >
                Reset
              </button>
            </>
          )}
      </div>
    </div>
  );
}

function EnvironmentDrawer({
  organizationId,
  workspaceId,
  projectId,
  environment,
  onClose,
  onSaved,
}: {
  organizationId: string;
  workspaceId: string;
  projectId: string;
  environment: V2Environment | null;
  onClose: () => void;
  onSaved: (environment: V2Environment) => void;
}) {
  const editing = Boolean(environment);
  const [name, setName] = useState(environment?.name ?? "");
  const [kind, setKind] = useState<V2Environment["kind"]>(environment?.kind ?? "STAGING");
  const [baseUrl, setBaseUrl] = useState(environment?.baseUrl ?? "");
  const [description, setDescription] = useState(environment?.description ?? "");
  const [healthPaths, setHealthPaths] = useState("/");
  const [httpHeaders, setHttpHeaders] = useState<EnvironmentHttpHeaderWrite[]>(
    environment?.httpHeaders?.map((header) => ({ key: header.key, value: "" })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = new URL(baseUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error("Use an http(s) URL without embedded credentials.");
      if (baseUrl.trim().endsWith("/")) throw new Error("Base URL must not end with a slash.");
      const healthChecks = healthPaths
        .split("\n")
        .map((path) => path.trim())
        .filter(Boolean)
        .map((path) => ({ name: path === "/" ? "base URL" : path, path, expectedStatus: 200 }));
      if (healthChecks.some((item) => !item.path.startsWith("/") || item.path.startsWith("//")))
        throw new Error("Health checks must be relative same-origin paths.");
      const normalizedHeaders = httpHeaders
        .map((header) => ({ key: header.key.trim(), value: header.value }))
        .filter((header) => header.key);
      if (
        new Set(normalizedHeaders.map((header) => header.key.toLowerCase())).size !==
        normalizedHeaders.length
      )
        throw new Error("Custom HTTP header names must be unique.");
      const saved = editing
        ? await v2Api.updateEnvironment(environment!.id, {
            name: name.trim(),
            kind,
            baseUrl: baseUrl.trim(),
            description: description.trim() || undefined,
            healthChecks,
            httpHeaders: normalizedHeaders,
          })
        : await v2Api.createEnvironment({
            organizationId,
            workspaceId,
            projectId,
            name: name.trim(),
            kind,
            baseUrl: baseUrl.trim(),
            description: description.trim() || undefined,
            healthChecks,
            httpHeaders: normalizedHeaders,
          });
      onSaved(saved);
    } catch (cause) {
      setError(
        toMessage(
          cause,
          editing ? "Unable to update environment." : "Unable to create environment.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title={editing ? "Edit environment" : "Add environment"}
      subtitle="Save a target context without embedding credentials."
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4 p-5">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
        <Field label="Name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="Staging"
            disabled={busy}
          />
        </Field>
        <Field label="Base URL">
          <input
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://staging.example.com"
            disabled={busy}
          />
        </Field>
        <Field label="Kind">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as V2Environment["kind"])}
            disabled={busy}
          >
            <option value="PREVIEW">Preview</option>
            <option value="STAGING">Staging</option>
            <option value="PRODUCTION">Production-like</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="What this environment is safe for…"
            disabled={busy}
          />
        </Field>
        <Field label="Health paths">
          <textarea
            value={healthPaths}
            onChange={(event) => setHealthPaths(event.target.value)}
            rows={3}
            placeholder="/\n/health"
            disabled={busy}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            One relative same-origin GET path per line. Matrix QA never follows external redirects.
          </span>
        </Field>
        <Field label="Custom HTTP Headers">
          <div className="space-y-2">
            {httpHeaders.map((header, index) => (
              <div
                key={`${header.key}-${index}`}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              >
                <input
                  value={header.key}
                  onChange={(event) =>
                    setHttpHeaders((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="X-WAF-Token"
                  disabled={busy}
                />
                <input
                  type="password"
                  value={header.value}
                  onChange={(event) =>
                    setHttpHeaders((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder={
                    environment?.httpHeaders?.some((item) => item.key === header.key)
                      ? "Leave blank to keep existing value"
                      : "Header value"
                  }
                  disabled={busy}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() =>
                    setHttpHeaders((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  disabled={busy}
                  className="rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setHttpHeaders((current) => [...current, { key: "", value: "" }])}
              disabled={busy}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold hover:border-primary"
            >
              Add header
            </button>
          </div>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Values are write-only and masked while entering them.
          </span>
        </Field>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
          Never paste tokens, passwords, cookies, or API keys into any field. Use the managed secret
          system for credentials.
        </div>
        <DrawerFooter
          busy={busy}
          disabled={!name.trim() || !baseUrl.trim()}
          label={editing ? "Update control-plane record" : "Save control-plane record"}
        />
      </form>
    </Drawer>
  );
}

function FixtureDrawer({
  projectId,
  environments,
  onClose,
  onCreated,
}: {
  projectId: string;
  environments: V2Environment[];
  onClose: () => void;
  onCreated: (fixture: V2TestDataFixture) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [strategy, setStrategy] = useState<V2FixtureStrategy>("MANUAL");
  const [environmentId, setEnvironmentId] = useState("");
  const [maskedFields, setMaskedFields] = useState("email\nphone\naddress");
  const [seedSpec, setSeedSpec] = useState("");
  const [resetSpec, setResetSpec] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parseSpec = (value: string, label: string) => {
    if (!value.trim()) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${label} must be valid JSON.`);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const seed = parseSpec(seedSpec, "Seed specification");
      const reset = parseSpec(resetSpec, "Reset specification");
      onCreated(
        await v2Api.createTestDataFixture({
          projectId,
          environmentId: environmentId || undefined,
          name: name.trim(),
          description: description.trim() || undefined,
          strategy,
          seedSpec: seed,
          resetSpec: reset,
          maskedFields: maskedFields
            .split("\n")
            .map((field) => field.trim())
            .filter(Boolean),
        }),
      );
    } catch (cause) {
      setError(toMessage(cause, "Unable to create fixture."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Drawer
      title="Add test-data fixture"
      subtitle="Declare repeatable data conditions without storing customer data."
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4 p-5">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
        <Field label="Fixture name">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="New customer · empty cart"
            disabled={busy}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Known starting state for checkout coverage…"
            disabled={busy}
          />
        </Field>
        <Field label="Environment (optional)">
          <select
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            disabled={busy}
          >
            <option value="">Project-wide fixture</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lifecycle strategy">
          <select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as V2FixtureStrategy)}
            disabled={busy}
          >
            <option value="MANUAL">Manual setup</option>
            <option value="HTTP_HOOK">Approved HTTP hook metadata</option>
            <option value="DATABASE_SNAPSHOT">Database snapshot metadata</option>
          </select>
        </Field>
        {strategy !== "MANUAL" && (
          <>
            <Field label="Seed metadata JSON">
              <textarea
                value={seedSpec}
                onChange={(event) => setSeedSpec(event.target.value)}
                rows={4}
                placeholder={'{"operation":"POST","path":"/internal/qa/seed"}'}
                disabled={busy}
              />
            </Field>
            <Field label="Reset metadata JSON">
              <textarea
                value={resetSpec}
                onChange={(event) => setResetSpec(event.target.value)}
                rows={4}
                placeholder={'{"operation":"POST","path":"/internal/qa/reset"}'}
                disabled={busy}
              />
            </Field>
          </>
        )}
        <Field label="Masked field names">
          <textarea
            value={maskedFields}
            onChange={(event) => setMaskedFields(event.target.value)}
            rows={3}
            placeholder="email\nphone\naddress"
            disabled={busy}
          />
          <span className="mt-1 block text-[11px] text-muted-foreground">
            Names only. Do not enter real values. These declarations guide future redaction.
          </span>
        </Field>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs leading-5 text-muted-foreground">
          Fixture metadata is validated but not executed from this page. No SQL, credentials,
          cookies, or customer records are accepted.
        </div>
        <DrawerFooter
          busy={busy}
          disabled={
            !name.trim() || (strategy !== "MANUAL" && (!seedSpec.trim() || !resetSpec.trim()))
          }
        />
      </form>
    </Drawer>
  );
}

function Drawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-surface">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </header>
        {children}
      </aside>
    </div>
  );
}
function DrawerFooter({
  busy,
  disabled,
  label = "Save control-plane record",
}: {
  busy: boolean;
  disabled: boolean;
  label?: string;
}) {
  return (
    <div className="border-t border-border pt-4">
      <button
        type="submit"
        disabled={busy || disabled}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} {label}
      </button>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-foreground">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
function EmptyRow({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="px-5 py-8">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}
function toMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
