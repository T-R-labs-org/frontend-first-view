import { useEffect, useMemo, useState } from "react";
import {
  organizationsApi,
  projectsApi,
  runsApi,
  workspacesApi,
  type Organization,
  type Project,
  type RunListItem,
  type RunReport,
  type Workspace,
} from "./api-client";

export const ACTIVE_ORG_KEY = "matrix_qa_active_organization";
export const ACTIVE_WORKSPACE_KEY = "matrix_qa_active_workspace";
export const ACTIVE_PROJECT_KEY = "matrix_qa_active_project";
export const SCOPE_CHANGED_EVENT = "matrix_qa_scope_changed";

export interface LiveRun extends RunListItem {
  project: Project;
}

export interface LiveIssue {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  scope: string;
  category: string;
  occurrences: number;
  affectedRuns: string[];
  firstSeen: string;
  lastSeen: string;
  message: string;
  reportId: string;
  projectId: string;
}

export type LiveAuditCategory = "console_warning" | "network_noise" | "visual_shift";

export interface LiveAuditEntry {
  id: string;
  ts: string;
  runId: string;
  category: LiveAuditCategory;
  message: string;
  source?: string;
  reason: string;
  timestamp: number;
}

export interface LivePortfolio {
  organizations: Organization[];
  workspaces: Workspace[];
  projects: Project[];
  runs: LiveRun[];
  reports: RunReport[];
  issues: LiveIssue[];
  auditEntries: LiveAuditEntry[];
  activeOrganization: Organization | null;
  activeWorkspace: Workspace | null;
  activeProject: Project | null;
  setActiveOrganization: (organizationId: string) => void;
  setActiveWorkspace: (workspaceId: string) => void;
  setActiveProject: (projectId: string) => void;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const toMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.message ? cause.message : fallback;

const safeDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value: unknown) => {
  const date = safeDate(value);
  return date ? date.toLocaleString() : "—";
};

const eventDate = (value: unknown, fallback: unknown) => {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(\.\d+)?$/.test(value)
        ? Number(value)
        : NaN;
  if (Number.isFinite(numeric) && numeric >= 0 && numeric < 1_000_000_000_000) {
    const base = safeDate(fallback);
    if (base) return new Date(base.getTime() + numeric);
  }
  return safeDate(value) ?? safeDate(fallback) ?? new Date();
};

const textValue = (value: unknown, fallback = "Unknown finding") => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
};

const recordValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const severityFor = (item: Record<string, unknown>): LiveIssue["severity"] => {
  const explicit = textValue(item.severity, "").toLowerCase();
  if (explicit === "critical" || explicit === "high" || explicit === "medium" || explicit === "low")
    return explicit;
  const status = Number(item.status);
  const subtype = textValue(item.subtype, "").toLowerCase();
  if (subtype === "pageerror" || subtype === "console" || status >= 500) return "critical";
  if (status >= 400) return "high";
  if (subtype === "visual" || subtype === "layout") return "medium";
  return "low";
};

const issueFrom = (run: LiveRun, report: RunReport, raw: unknown, index: number): LiveIssue => {
  const item = recordValue(raw);
  const message = textValue(
    item.message ?? item.error ?? item.text ?? item.title,
    "Unlabelled backend finding",
  );
  const subtype = textValue(item.subtype ?? item.category ?? item.type, "finding").toLowerCase();
  const status = Number(item.status);
  const scope = textValue(item.target ?? item.url ?? item.scope, run.targetUrl);
  const category = status ? `HTTP ${status}` : subtype;
  const timestamp = eventDate(item.timestamp ?? item.t, run.startedAt ?? run.createdAt);
  return {
    id: `${run.id}-${index}-${subtype}`,
    title: message,
    severity: severityFor(item),
    scope,
    category,
    occurrences: 1,
    affectedRuns: [run.id],
    firstSeen: formatDate(timestamp),
    lastSeen: formatDate(timestamp),
    message,
    reportId: run.id,
    projectId: run.projectId,
  };
};

export const deriveIssues = (runs: LiveRun[], reports: RunReport[]): LiveIssue[] => {
  const grouped = new Map<string, LiveIssue>();
  reports.forEach((report) => {
    const run = runs.find((item) => item.id === (report.runId ?? report.id));
    if (!run) return;
    const rawItems = [
      ...(Array.isArray(report.errors) ? report.errors : []),
      ...(Array.isArray((report as Record<string, unknown>).issues)
        ? ((report as Record<string, unknown>).issues as unknown[])
        : []),
    ];
    rawItems.forEach((raw, index) => {
      const issue = issueFrom(run, report, raw, index);
      const key = `${issue.title.toLowerCase()}|${issue.category.toLowerCase()}`;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, issue);
        return;
      }
      existing.occurrences += 1;
      if (!existing.affectedRuns.includes(run.id)) existing.affectedRuns.push(run.id);
      const candidate = eventDate(
        recordValue(raw).timestamp ?? recordValue(raw).t,
        run.startedAt ?? run.createdAt,
      );
      if (candidate && candidate.getTime() < (safeDate(existing.firstSeen)?.getTime() ?? Infinity))
        existing.firstSeen = formatDate(candidate);
      if (candidate && candidate.getTime() > (safeDate(existing.lastSeen)?.getTime() ?? -Infinity))
        existing.lastSeen = formatDate(candidate);
    });
  });
  return [...grouped.values()].sort(
    (a, b) => b.occurrences - a.occurrences || a.title.localeCompare(b.title),
  );
};

export const deriveAuditEntries = (runs: LiveRun[], reports: RunReport[]): LiveAuditEntry[] => {
  const entries: LiveAuditEntry[] = [];
  reports.forEach((report) => {
    const run = runs.find((item) => item.id === (report.runId ?? report.id));
    if (!run) return;
    const auditLog = (report as Record<string, unknown>).auditLog;
    if (!Array.isArray(auditLog)) return;
    auditLog.forEach((raw, index) => {
      const item = recordValue(raw);
      const timestamp = eventDate(
        item.timestamp ?? item.t,
        run.startedAt ?? run.createdAt,
      ).getTime();
      const type = textValue(item.type, "info").toLowerCase();
      const category: LiveAuditCategory =
        type === "warning"
          ? "console_warning"
          : type === "redirect"
            ? "network_noise"
            : "visual_shift";
      entries.push({
        id: `${run.id}-audit-${index}`,
        ts: formatDate(timestamp),
        runId: run.id,
        category,
        message: textValue(item.message, "Audit event"),
        source: textValue(item.url ?? item.source, "") || undefined,
        reason:
          type === "warning"
            ? "Retained as a non-primary warning"
            : "Retained outside the primary finding stream",
        timestamp,
      });
    });
  });
  return entries.sort((a, b) => b.timestamp - a.timestamp);
};

export function useLivePortfolio(): LivePortfolio {
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<Omit<LivePortfolio, "refresh" | "setActiveOrganization" | "setActiveWorkspace" | "setActiveProject">>({
    organizations: [],
    workspaces: [],
    projects: [],
    runs: [],
    reports: [],
    issues: [],
    auditEntries: [],
    activeOrganization: null,
    activeWorkspace: null,
    activeProject: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const organizations = await organizationsApi.list();
        const storedOrg =
          typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ORG_KEY) : null;
        const activeOrganization =
          organizations.find((item) => item.id === storedOrg) ?? organizations[0] ?? null;
        if (activeOrganization && typeof window !== "undefined")
          localStorage.setItem(ACTIVE_ORG_KEY, activeOrganization.id);
        const workspaces = activeOrganization
          ? await workspacesApi.list(activeOrganization.id)
          : [];
        const storedWorkspace =
          typeof window !== "undefined" ? localStorage.getItem(ACTIVE_WORKSPACE_KEY) : null;
        const activeWorkspace =
          workspaces.find((item) => item.id === storedWorkspace) ?? workspaces[0] ?? null;
        if (activeWorkspace && typeof window !== "undefined")
          localStorage.setItem(ACTIVE_WORKSPACE_KEY, activeWorkspace.id);
        const projects = activeOrganization
          ? await projectsApi.list(activeOrganization.id, activeWorkspace?.id)
          : [];
        const storedProject =
          typeof window !== "undefined" ? localStorage.getItem(ACTIVE_PROJECT_KEY) : null;
        const activeProject =
          projects.find((item) => item.id === storedProject) ?? projects[0] ?? null;
        if (activeProject && typeof window !== "undefined")
          localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject.id);
        if (cancelled) return;
        setState((current) => ({
          ...current,
          organizations,
          workspaces,
          projects,
          activeOrganization,
          activeWorkspace,
          activeProject,
          loading: false,
          error: null,
        }));

        const groupedRuns = await Promise.all(
          projects.map(async (project) => {
            const items = await runsApi.list(project.id);
            return items.map((run) => ({ ...run, project }));
          }),
        );
        const runs = groupedRuns.flat().sort((a, b) => {
          const left = safeDate(a.startedAt ?? a.createdAt)?.getTime() ?? 0;
          const right = safeDate(b.startedAt ?? b.createdAt)?.getTime() ?? 0;
          return right - left;
        });
        if (cancelled) return;
        setState((current) => ({
          ...current,
          runs,
          issues: deriveIssues(runs, current.reports),
          auditEntries: deriveAuditEntries(runs, current.reports),
        }));

        const reportResults = await Promise.all(
          runs.slice(0, 24).map(async (run) => {
            try {
              return await runsApi.getReport(run.projectId, run.id);
            } catch {
              return null;
            }
          }),
        );
        const reports = reportResults.filter((report): report is RunReport => Boolean(report));
        if (cancelled) return;
        setState((current) => ({
          ...current,
          reports,
          issues: deriveIssues(runs, reports),
          auditEntries: deriveAuditEntries(runs, reports),
        }));
      } catch (cause) {
        if (!cancelled)
          setState((current) => ({
            ...current,
            loading: false,
            error: toMessage(cause, "Unable to load live Matrix QA data."),
          }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleScopeChange = () => setReloadKey((key) => key + 1);
    window.addEventListener(SCOPE_CHANGED_EVENT, handleScopeChange);
    return () => window.removeEventListener(SCOPE_CHANGED_EVENT, handleScopeChange);
  }, []);

  const clearScopeData = () => {
    setState((current) => ({
      ...current,
      workspaces: [],
      projects: [],
      runs: [],
      reports: [],
      issues: [],
      auditEntries: [],
      loading: true,
      error: null,
    }));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SCOPE_CHANGED_EVENT));
    else setReloadKey((key) => key + 1);
  };

  const setActiveOrganization = (organizationId: string) => {
    const organization = state.organizations.find((item) => item.id === organizationId);
    if (!organization || organization.id === state.activeOrganization?.id) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_ORG_KEY, organization.id);
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    setState((current) => ({
      ...current,
      activeOrganization: organization,
      activeWorkspace: null,
      activeProject: null,
    }));
    clearScopeData();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("matrix-qa-organization-changed"));
  };

  const setActiveWorkspace = (workspaceId: string) => {
    const workspace = state.workspaces.find((item) => item.id === workspaceId);
    if (!workspace || workspace.id === state.activeWorkspace?.id) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspace.id);
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
    setState((current) => ({ ...current, activeWorkspace: workspace, activeProject: null }));
    clearScopeData();
  };

  const setActiveProject = (projectId: string) => {
    const project = state.projects.find((item) => item.id === projectId) ?? null;
    if (!project) return;
    if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_PROJECT_KEY, project.id);
    setState((current) => ({ ...current, activeProject: project }));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SCOPE_CHANGED_EVENT));
  };
  return useMemo(
    () => ({ ...state, setActiveOrganization, setActiveWorkspace, setActiveProject, refresh: () => setReloadKey((key) => key + 1) }),
    [state],
  );
}

export const formatLiveDate = formatDate;
export const formatLiveDuration = (seconds?: number | null) => {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds as number));
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
};

export const reportForRun = (reports: RunReport[], runId: string | undefined) =>
  reports.find((report) => (report.runId ?? report.id) === runId) ?? null;

export const reportTitle = (report: RunReport | null) => {
  if (!report) return "No completed report yet";
  if (report.status === "COMPLETED") return "Deployment readiness report";
  return "In-progress run report";
};

export const reportWarnings = (report: RunReport | null) => {
  if (!report) return 0;
  const errors = Array.isArray(report.errors) ? report.errors.length : 0;
  const audit = Array.isArray((report as Record<string, unknown>).auditLog)
    ? ((report as Record<string, unknown>).auditLog as unknown[]).length
    : 0;
  return errors + audit;
};

export const runStartedTime = (run: LiveRun) => formatDate(run.startedAt ?? run.createdAt);

export const runNumber = (runs: LiveRun[], id: string) => {
  const index = runs.findIndex((run) => run.id === id);
  return index >= 0 ? `#${runs.length - index}` : "#—";
};
