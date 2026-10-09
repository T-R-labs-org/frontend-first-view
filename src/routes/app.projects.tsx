import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Globe, Loader2, Plus, Play, X } from "lucide-react";
import {
  organizationsApi,
  projectsApi,
  workspacesApi,
  type Organization,
  type Project,
  type Workspace,
} from "@/lib/api-client";
import { useLivePortfolio } from "@/lib/live-data";

const ACTIVE_ORG_KEY = "matrix_qa_active_organization";
const ACTIVE_WORKSPACE_KEY = "matrix_qa_active_workspace";
const ACTIVE_PROJECT_KEY = "matrix_qa_active_project";

export const Route = createFileRoute("/app/projects")({
  head: () => ({
    meta: [{ title: "Projects · Matrix QA" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const live = useLivePortfolio();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);

  useEffect(() => {
    let cancelled = false;
    organizationsApi
      .list()
      .then((items) => {
        if (cancelled) return;
        setOrganizations(items);
        const stored = localStorage.getItem(ACTIVE_ORG_KEY);
        const selected = items.find((item) => item.id === stored) ?? items[0];
        if (selected) {
          setOrganizationId(selected.id);
          localStorage.setItem(ACTIVE_ORG_KEY, selected.id);
        }
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
    setLoadingProjects(true);
    setError(null);
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
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoadingProjects(true);
    projectsApi
      .list(organizationId, workspaceId ?? undefined)
      .then((items) => {
        if (!cancelled) setProjects(items);
      })
      .catch((cause) => {
        if (!cancelled) setError(toMessage(cause, "Unable to load projects."));
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, workspaceId]);

  useEffect(() => {
    if (live.activeOrganization?.id && live.activeOrganization.id !== organizationId) setOrganizationId(live.activeOrganization.id);
    if (live.activeWorkspace?.id && live.activeWorkspace.id !== workspaceId) setWorkspaceId(live.activeWorkspace.id);
  }, [live.activeOrganization?.id, live.activeWorkspace?.id, organizationId, workspaceId]);

  const activeOrganization = organizations.find((item) => item.id === organizationId);
  const activeWorkspace = workspaces.find((item) => item.id === workspaceId);

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organizationId || !workspaceName.trim()) return;
    setCreatingWorkspace(true);
    setError(null);
    try {
      const created = await workspacesApi.create({ organizationId, name: workspaceName.trim() });
      setWorkspaces((current) => [created, ...current]);
      setWorkspaceId(created.id);
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, created.id);
      live.refresh();
      setWorkspaceName("");
    } catch (cause) {
      setError(toMessage(cause, "Unable to create workspace."));
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const handleOrganizationChange = (value: string) => {
    setOrganizationId(value);
    live.setActiveOrganization(value);
  };

  const projectCountLabel = useMemo(
    () => `${projects.length} project${projects.length === 1 ? "" : "s"}`,
    [projects.length],
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
              Projects
            </h1>
            <span className="rounded-full border border-border bg-surface-2/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {projectCountLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Live projects scoped to the selected organization and workspace.
          </p>
        </div>
        <button
          onClick={() => setOpenDrawer(true)}
          disabled={!organizationId || !workspaceId}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground btn-primary-glow hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr]">
        <label className="block text-xs font-medium text-muted-foreground">
          Organization
          <select
            value={organizationId ?? ""}
            onChange={(event) => handleOrganizationChange(event.target.value)}
            disabled={loading || organizations.length === 0}
            className="mt-1.5 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {!organizations.length && <option value="">No organization yet</option>}
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          Workspace
          <select
            value={workspaceId ?? ""}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              live.setActiveWorkspace(event.target.value);
            }}
            disabled={!organizationId || workspaces.length === 0}
            className="mt-1.5 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {!workspaces.length && <option value="">Create a workspace below</option>}
            {workspaces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && organizationId && workspaces.length === 0 && (
        <form
          onSubmit={createWorkspace}
          className="mt-5 flex flex-wrap items-end gap-3 rounded-md border border-primary/25 bg-primary/5 p-4"
        >
          <div className="min-w-[240px] flex-1">
            <label className="block text-xs font-medium text-foreground">
              Create your first workspace
            </label>
            <input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder={`${activeOrganization?.name ?? "Team"} QA`}
              className="mt-1.5 w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={creatingWorkspace || !workspaceName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {creatingWorkspace && <Loader2 className="h-4 w-4 animate-spin" />}Create workspace
          </button>
        </form>
      )}

      {(loading || loadingProjects) && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading live projects…
        </div>
      )}
      {!loading && !loadingProjects && organizationId && workspaceId && projects.length === 0 && (
        <div className="mt-6 rounded-md border border-dashed border-border p-12 text-center">
          <p className="font-display text-base font-semibold">
            No projects in {activeWorkspace?.name ?? "this workspace"} yet.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a project with a staging URL to start the first live browser run.
          </p>
        </div>
      )}
      {!loading && !loadingProjects && projects.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectGridCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {openDrawer && organizationId && workspaceId && (
        <NewProjectDrawer
          organizationId={organizationId}
          workspaceId={workspaceId}
          onClose={() => setOpenDrawer(false)}
          onCreated={(created) => {
            setProjects((current) => [created, ...current]);
            localStorage.setItem(ACTIVE_PROJECT_KEY, created.id);
            setOpenDrawer(false);
          }}
        />
      )}
    </div>
  );
}

function ProjectGridCard({ project }: { project: Project }) {
  const targetUrl = project.defaultTargetUrl || project.targetUrl || "No target URL";
  return (
    <div className="surface-card group flex flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-semibold">{project.name}</div>
          <a
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-primary"
          >
            <Globe className="h-3 w-3 shrink-0" />
            {targetUrl}
            <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-100" />
          </a>
        </div>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Ready
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-4 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Created</div>
          <div className="mt-1 font-mono text-xs">
            {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : "—"}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Workspace
          </div>
          <div className="mt-1 truncate font-mono text-xs">{project.workspaceId.slice(0, 8)}…</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border bg-surface-2/40 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Live backend project
        </span>
        <a
          href={`/app/runs?projectId=${encodeURIComponent(project.id)}`}
          onClick={() => localStorage.setItem(ACTIVE_PROJECT_KEY, project.id)}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface/60 px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Play className="h-3.5 w-3.5" /> View runs
        </a>
      </div>
    </div>
  );
}

function NewProjectDrawer({
  organizationId,
  workspaceId,
  onClose,
  onCreated,
}: {
  organizationId: string;
  workspaceId: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) {
      setError("Project name and target URL are required.");
      return;
    }
    const urlError = validateTargetUrl(trimmedUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await projectsApi.create({
        organizationId,
        workspaceId,
        name: trimmedName,
        description: description.trim() || undefined,
        defaultTargetUrl: trimmedUrl,
      });
      onCreated(created);
    } catch (cause) {
      setError(toMessage(cause, "Failed to create project."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative flex w-full max-w-md flex-col border-l border-border bg-surface"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold">New Project</h2>
            <p className="text-xs text-muted-foreground">
              Create a real backend project in the selected workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">Project name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Client Checkout Flow"
              disabled={isSubmitting}
              className="w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              Target base URL
            </span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://staging.your-app.com"
              disabled={isSubmitting}
              className="w-full rounded-md border border-border bg-surface-2/40 px-3 py-2 font-mono text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              Description <span className="text-muted-foreground">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What should Matrix QA validate?"
              disabled={isSubmitting}
              className="w-full resize-none rounded-md border border-border bg-surface-2/40 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="rounded-md border border-border/60 bg-surface-2/30 p-3 text-xs text-muted-foreground">
            Projects are created in the selected organization and workspace. Test credentials can be
            added later through the secure project settings flow.
          </div>
        </div>
        <div className="border-t border-border bg-surface-2/40 px-5 py-3">
          <button
            type="submit"
            disabled={!name.trim() || !url.trim() || isSubmitting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground btn-primary-glow disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}Create project
          </button>
        </div>
      </form>
    </div>
  );
}

function validateTargetUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
      return "Target URL must use a valid http:// or https:// address.";
    }
    return null;
  } catch {
    return "Target URL must use a valid http:// or https:// address.";
  }
}

function toMessage(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}
