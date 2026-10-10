import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, LockKeyhole, Play } from "lucide-react";
import type { ProjectRole, RunScenarioChoice, V2Viewport } from "@/lib/api-client";

export interface TriggerRunPayload {
  projectId: string;
  environmentId: string;
  scenarioIds: string[];
  viewportIds: string[];
  networkProfiles: Array<"FAST" | "SLOW_3G" | "OFFLINE">;
  roleIds: string[];
}
export type MatrixSelection = Omit<TriggerRunPayload, "projectId" | "environmentId">;
type Props = {
  projectId: string;
  environmentId: string;
  catalogScenarios: RunScenarioChoice[];
  systemScenarios: RunScenarioChoice[];
  viewports: V2Viewport[];
  roles: ProjectRole[];
  planLimit?: number;
  busy?: boolean;
  metadataLoading?: boolean;
  metadataError?: string | null;
  error?: string | null;
  onSelectionChange?: (selection: MatrixSelection) => void;
  onStart: (payload: TriggerRunPayload) => void;
};
type Choice<T extends string = string> = { id: T; label: string; detail?: string };
const networks: Choice<"FAST" | "SLOW_3G" | "OFFLINE">[] = [
  { id: "FAST", label: "Fast", detail: "Wi-Fi / 4G" },
  { id: "SLOW_3G", label: "Slow 3G" },
  { id: "OFFLINE", label: "Offline" },
];

export function RunConfigurationPanel({
  projectId,
  environmentId,
  catalogScenarios,
  systemScenarios,
  viewports,
  roles,
  planLimit = 2,
  busy = false,
  metadataLoading = false,
  metadataError,
  error,
  onSelectionChange,
  onStart,
}: Props) {
  const [selection, setSelection] = useState<MatrixSelection>({
    scenarioIds: [],
    viewportIds: [],
    networkProfiles: ["FAST"],
    roleIds: [],
  });
  const scenarioChoices = useMemo(
    () => [...catalogScenarios, ...systemScenarios],
    [catalogScenarios, systemScenarios],
  );
  const roleChoices = useMemo<Choice[]>(
    () =>
      roles.map((role) => ({
        id: role.id,
        label: `${role.name}${role.roleType === "GUEST" ? " · Guest" : " · Authenticated"}`,
        detail: role.sessionStatus,
      })),
    [roles],
  );
  const viewportChoices = useMemo<Choice[]>(
    () =>
      viewports.map((viewport) => ({
        id: viewport.id,
        label: `${viewport.category[0].toUpperCase()}${viewport.category.slice(1)} · ${viewport.label}`,
        detail: `${viewport.width} × ${viewport.height}`,
      })),
    [viewports],
  );

  useEffect(() => {
    const preferredScenarios = catalogScenarios.length ? catalogScenarios : systemScenarios;
    const preferredRoles = roles.filter((role) => role.roleType === "GUEST");
    setSelection({
      scenarioIds: preferredScenarios.slice(0, planLimit).map((scenario) => scenario.id),
      viewportIds: viewports
        .filter((viewport) =>
          ["desktop_1920x1080", "ipad_gen7_portrait", "iphone_13"].includes(viewport.id),
        )
        .map((viewport) => viewport.id),
      networkProfiles: ["FAST"],
      roleIds: (preferredRoles.length ? preferredRoles : roles).slice(0, 1).map((role) => role.id),
    });
  }, [environmentId, projectId, catalogScenarios, systemScenarios, viewports, roles, planLimit]);

  const payload = useMemo<TriggerRunPayload>(
    () => ({ projectId, environmentId, ...selection }),
    [environmentId, projectId, selection],
  );
  const totalExecutions =
    selection.scenarioIds.length *
    selection.viewportIds.length *
    selection.networkProfiles.length *
    selection.roleIds.length;
  const canStart =
    !busy &&
    !metadataLoading &&
    !metadataError &&
    payload.scenarioIds.length > 0 &&
    payload.viewportIds.length > 0 &&
    payload.networkProfiles.length > 0 &&
    payload.roleIds.length > 0;
  const toggle = <K extends keyof MatrixSelection>(
    key: K,
    value: MatrixSelection[K][number],
    limit?: number,
  ) => {
    setSelection((current) => {
      const selected = current[key] as string[];
      const next = selected.includes(String(value))
        ? selected.filter((item) => item !== String(value))
        : !limit || selected.length < limit
          ? [...selected, String(value)]
          : selected;
      return { ...current, [key]: next } as MatrixSelection;
    });
  };
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [onSelectionChange, selection]);

  return (
    <section
      className="rounded-xl border border-primary/25 bg-background/40 p-5"
      aria-labelledby="run-configuration-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Run configuration
          </p>
          <h3 id="run-configuration-title" className="mt-1 font-display text-xl font-semibold">
            Choose your coverage matrix
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Selections are loaded from this project, environment, and the canonical backend viewport
            catalog.
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
          {totalExecutions} executions
        </span>
      </div>
      <div className="mt-5 space-y-5">
        <ConfigGroup title="1. Select scenarios" hint={`Combined plan limit: ${planLimit}`}>
          {metadataLoading ? (
            <LoadingLine label="Loading saved scenarios…" />
          ) : scenarioChoices.length === 0 ? (
            <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              No usable saved or system-generated scenarios are available.
            </p>
          ) : (
            <div className="space-y-3">
              {catalogScenarios.length > 0 && (
                <ScenarioGroup
                  title="Saved scenarios"
                  choices={catalogScenarios}
                  selection={selection.scenarioIds}
                  busy={busy}
                  limit={planLimit}
                  toggle={(id) => toggle("scenarioIds", id, planLimit)}
                />
              )}
              {systemScenarios.length > 0 && (
                <ScenarioGroup
                  title="System-generated scenarios"
                  choices={systemScenarios}
                  selection={selection.scenarioIds}
                  busy={busy}
                  limit={planLimit}
                  toggle={(id) => toggle("scenarioIds", id, planLimit)}
                />
              )}
            </div>
          )}
        </ConfigGroup>
        <ConfigGroup title="2. Matrix dimensions" hint="Select at least one from each group">
          <div className="grid gap-4 md:grid-cols-3">
            <ChoiceGroup
              title="Devices / Viewports"
              choices={viewportChoices}
              selected={selection.viewportIds}
              disabled={busy || metadataLoading}
              onToggle={(id) => toggle("viewportIds", id)}
            />
            <ChoiceGroup
              title="Network conditions"
              choices={networks}
              selected={selection.networkProfiles}
              disabled={busy || metadataLoading}
              onToggle={(id) =>
                toggle("networkProfiles", id as MatrixSelection["networkProfiles"][number])
              }
            />
            <ChoiceGroup
              title="User roles"
              choices={roleChoices}
              selected={selection.roleIds}
              disabled={busy || metadataLoading}
              onToggle={(id) => toggle("roleIds", id)}
            />
          </div>
        </ConfigGroup>
        {metadataError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Configuration metadata could not be loaded: {metadataError} Start Run is disabled until
            valid project/environment selections are available.
          </p>
        )}
        <div className="sticky bottom-0 rounded-lg border border-primary/30 bg-primary/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Matrix Calculation</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {selection.scenarioIds.length} Scenarios × {selection.viewportIds.length} Devices ×{" "}
                {selection.networkProfiles.length} Networks × {selection.roleIds.length} Roles ={" "}
                <strong className="text-primary">{totalExecutions} Total Test Executions</strong>
              </p>
            </div>
            <button
              type="button"
              disabled={!canStart}
              onClick={() => onStart(payload)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{" "}
              {busy ? "Starting…" : "Start Run"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          {!canStart && !busy && !metadataError && (
            <p className="mt-2 text-xs text-warning">
              Select at least one scenario, viewport, network, and role to continue.
            </p>
          )}
        </div>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] text-muted-foreground">
          Preview JSON payload
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-black/20 p-3 text-[10px] text-muted-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function ScenarioGroup({
  title,
  choices,
  selection,
  busy,
  limit,
  toggle,
}: {
  title: string;
  choices: RunScenarioChoice[];
  selection: string[];
  busy: boolean;
  limit: number;
  toggle: (id: string) => void;
}) {
  return (
    <div>
      <h5 className="mb-2 text-xs font-semibold text-muted-foreground">{title}</h5>
      <div className="space-y-2">
        {choices.map((choice) => {
          const checked = selection.includes(choice.id);
          const locked = !checked && selection.length >= limit;
          return (
            <label
              key={choice.id}
              title={locked ? "Upgrade to add more scenarios." : undefined}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${locked ? "cursor-not-allowed border-border/60 opacity-50" : "cursor-pointer border-border hover:border-primary/40"}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={locked || busy}
                onChange={() => toggle(choice.id)}
                className="mt-0.5 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{choice.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {choice.detail ||
                    (choice.source === "CATALOG"
                      ? "Saved project scenario"
                      : "Generated from the discovery plan")}
                </span>
              </span>
              {locked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <LockKeyhole className="h-3 w-3" /> Upgrade to add more.
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
function ConfigGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </div>
      {children}
    </div>
  );
}
function LoadingLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}
function ChoiceGroup({
  title,
  choices,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  choices: Choice[];
  selected: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <h5 className="mb-2 text-xs font-semibold text-muted-foreground">{title}</h5>
      <div className="space-y-2">
        {choices.map((choice) => (
          <label key={choice.id} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(choice.id)}
              disabled={disabled}
              onChange={() => onToggle(choice.id)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block">{choice.label}</span>
              {choice.detail && (
                <span className="block text-[11px] text-muted-foreground">{choice.detail}</span>
              )}
            </span>
            {selected.includes(choice.id) && (
              <Check className="ml-auto mt-0.5 h-3.5 w-3.5 text-primary" />
            )}
          </label>
        ))}
      </div>
    </div>
  );
}
