/**
 * API Client for Matrix QA Backend
 * Handles all HTTP requests to backend endpoints with proper error handling and token management.
 */

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "https://matrix-qa-backend.onrender.com"
).replace(/\/$/, "");
const TOKEN_KEY = "matrix_qa_auth_token_v2";
export const AUTH_EVENT = "matrix-qa-auth-changed";
const CLIENT_WORKSPACE_STATE_KEYS = [
  "matrix_qa_active_organization",
  "matrix_qa_active_workspace",
  "matrix_qa_active_project",
] as const;
const MIA_MESSAGES_STORAGE_PREFIX = "matrixqa_mia_messages:";
export const clearLegacyClientMiaHistory = (): void => {
  if (typeof window === "undefined") return;
  Object.keys(localStorage)
    .filter((key) => key.startsWith(MIA_MESSAGES_STORAGE_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
};

export const clearClientWorkspaceContext = (): void => {
  if (typeof window !== "undefined") {
    CLIENT_WORKSPACE_STATE_KEYS.forEach((key) => localStorage.removeItem(key));
  }
};

export const getAuthToken = (): string | null =>
  typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export const setAuthToken = (token: string): void => {
  if (typeof window !== "undefined") {
    clearClientWorkspaceContext();
    localStorage.setItem(TOKEN_KEY, token);
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
};

export const clearAuthToken = (): void => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    clearClientWorkspaceContext();
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
};

interface RequestOptions extends RequestInit {
  requiresAuth?: boolean;
  timeoutMs?: number;
}

const DEFAULT_API_TIMEOUT_MS = 90_000;
const QUICK_SCAN_TIMEOUT_MS = 120_000;
const PLAN_PREPARATION_TIMEOUT_MS = 120_000;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const getErrorMessage = (data: unknown, status: number): string => {
  if (typeof data === "object" && data !== null && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string" && m.trim()) return m;
  }
  if (typeof data === "object" && data !== null && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return `Server Error (${status}). Please try again later.`;
};

/** Convert backend validation details into safe, actionable UI copy without leaking implementation internals. */
export const formatRunStartError = (cause: unknown, fallback: string): string => {
  const message = cause instanceof Error ? cause.message : String(cause ?? "");
  if (
    /quickScanHandoff(?:\.findings(?:\.\d+)?(?:\.property)?|[^\n]{0,160})[^\n]*property status should not exist/i.test(
      message,
    )
  ) {
    return "This Quick Scan handoff is out of date. Refresh the page and run Quick Scan again; the browser test was not started.";
  }
  return message.trim() || fallback;
};

export const apiRequest = async <T>(endpoint: string, options: RequestOptions = {}): Promise<T> => {
  if (!API_BASE_URL) {
    throw new Error("Matrix QA API endpoint is not configured. Set VITE_API_BASE_URL.");
  }

  const {
    requiresAuth = false,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    signal: callerSignal,
    ...fetchOptions
  } = options;
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(fetchOptions.headers);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(1_000, timeoutMs))
    : undefined;
  const forwardAbort = () => controller?.abort();
  if (controller && callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }
  const isMultipart = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  if (!isMultipart) headers.set("Content-Type", "application/json");

  if (requiresAuth) {
    const token = getAuthToken();
    if (!token) throw new Error("No authentication token found");
    headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      headers,
      ...(controller
        ? { signal: controller.signal }
        : callerSignal
          ? { signal: callerSignal }
          : {}),
    });
    if (!response.ok) {
      throw new ApiRequestError(
        getErrorMessage(await response.json().catch(() => ({})), response.status),
        response.status,
        endpoint,
      );
    }
    if (response.status === 204) return {} as T;
    return await response.json();
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Matrix QA request timed out after ${Math.max(1_000, timeoutMs)}ms.`);
    }
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      throw new Error(
        "Service is currently unavailable. Please check your connection or try again later.",
      );
    }
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
};

export interface SignUpRequest {
  email: string;
  password: string;
  fullName: string;
  workspaceName?: string;
}
export interface SignUpResponse {
  message: string;
  email: string;
}
export interface VerifyEmailRequest {
  email: string;
  code: string;
}
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    isStaff?: boolean;
    staffRole?: StaffRole | null;
  };
  accessToken: string;
  isNewUser?: boolean;
}
export interface BackendHealthResponse {
  status: "ok" | "degraded" | "error";
  database: "ok" | "error";
  schema: { status: string; missingTables: string[] };
  version: { public: string; build: string };
  build: string;
  timestamp: string;
}
export type StaffRole = "OWNER" | "OPERATIONS_ADMIN" | "OPERATOR" | "VIEWER";
export type StaffMembershipStatus = "ACTIVE" | "DISABLED";
export type StaffInvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "REVOKED";

export interface CurrentUserResponse {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  isStaff?: boolean;
  staffRole?: StaffRole | null;
  createdAt?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt?: string;
  updatedAt?: string;
  members?: Array<{ id: string; userId: string; role: string }>;
}
export interface CreateOrganizationRequest {
  name: string;
}

export type PublicPlan = "FREE" | "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
export type EntitlementAccessSource = "FREE" | "SUBSCRIPTION" | "ALPHA" | "STAFF" | "ADMIN";

export interface EffectivePlanResponse {
  organizationId: string | null;
  plan: PublicPlan;
  accessSource: EntitlementAccessSource;
  alphaRewardActive: boolean;
  monthlyMu: number;
  maxProjects: number;
  maxSeats: number;
  maxActiveRuns: number;
  maxLogicalWorkers: number;
  allowedModes: string[];
  fiveWorkerCollaboration: boolean;
  delegation: boolean;
  coverageMemory: string;
  independentReproduction: boolean;
  failureAnalysis: string;
  topUps: string;
  retentionDays: number;
  deepMatrix: boolean;
}

export interface MatrixUnitTopUpPackage {
  id: string;
  matrixUnits: number;
  priceUsd: number;
  pricePerMuUsd: number;
  billing: "one_time" | string;
}

export interface MatrixUnitTopUpCatalog {
  currency: string;
  formulaVersion: string;
  muPriceUsd: number;
  packages: MatrixUnitTopUpPackage[];
  purchaseEnabled: boolean;
  purchaseNote: string;
}
export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  projects?: Project[];
}
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  organizationId: string;
  workspaceId: string;
  defaultTargetUrl?: string | null;
  targetUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface CreateWorkspaceRequest {
  organizationId: string;
  name: string;
  description?: string;
}
export interface CreateProjectRequest {
  name: string;
  description?: string;
  organizationId: string;
  workspaceId: string;
  defaultTargetUrl?: string;
}
export type QuickScanVerificationStatus =
  "QUICK_SCAN_CONFIRMED" | "UNVERIFIED_LEAD" | "CONFIRMED" | "NOT_REPRODUCED" | "NOT_TESTED";

export interface QuickScanHandoffFinding {
  id: string;
  category: "meta" | "accessibility" | "links" | "content";
  code: string;
  title: string;
  evidence: string;
  status: QuickScanVerificationStatus;
  provenance?: "ONBOARDING_QUICK_SCAN" | "DOM_QUICK_SCAN";
  reportSection?: "QUICK_SCAN_DOM_FINDINGS" | "VISUAL_INTERACTIVE_FINDINGS";
  verificationNote?: string;
  verificationEvidenceRefs?: string[];
}

export interface QuickScanHandoff {
  source: "ONBOARDING_QUICK_SCAN";
  targetUrl: string;
  finalUrl: string | null;
  targetOrigin: string;
  httpStatus: number | null;
  checkedAt: string;
  summary: string | null;
  summaryStatus: "AI_GENERATED" | "UNAVAILABLE";
  findings: QuickScanHandoffFinding[];
}

/** Request shape accepted when a new run imports bounded Quick Scan findings. */
export type QuickScanHandoffRequestFinding = Omit<
  QuickScanHandoffFinding,
  "status" | "verificationNote" | "verificationEvidenceRefs"
>;
export interface QuickScanHandoffRequest {
  source: "ONBOARDING_QUICK_SCAN";
  targetUrl: string;
  finalUrl: string | null;
  targetOrigin: string;
  httpStatus: number | null;
  checkedAt: string;
  summary: string | null;
  summaryStatus: "AI_GENERATED" | "UNAVAILABLE";
  findings: QuickScanHandoffRequestFinding[];
}

export interface TriggerRunRequest {
  scenarioIds?: string[];
  roleIds?: string[];
  viewportIds?: string[];
  networkProfiles?: Array<"FAST" | "SLOW_3G" | "OFFLINE">;
  targetUrl?: string;
  idempotencyKey?: string;
  email?: string;
  password?: string;
  signupData?: { fullName: string; email: string; password: string; confirmPassword?: string };
  accessMode?: V2MissionAccessMode;
  enableVision?: boolean;
  enableRecovery?: boolean;
  targetAuthorizationConfirmed?: boolean;
  quickScanHandoff?: QuickScanHandoffRequest;
}
export interface ProviderCapacityDecision {
  status: "RESERVED" | "WAITING" | string;
  provider: string;
  reservationId?: string;
  estimatedUnits: number;
  usesProtectedReserve?: boolean;
  retryAt?: string;
  reason?: string;
}

export interface TriggerRunResponse {
  id: string;
  projectId: string;
  status: string;
  queued?: boolean;
  incomplete?: boolean;
  reportReady?: boolean;
  errorMessage?: string | null;
  metadata?: {
    providerCapacity?: ProviderCapacityDecision;
    runCapabilities?: { enableVision?: boolean; enableRecovery?: boolean };
  } | null;
}

export interface RunEvent {
  type: string;
  timestamp: number;
  target?: string;
  label?: string;
  x?: number;
  y?: number;
  url?: string;
  subtype?: string;
  status?: number;
  message?: string;
  filename?: string;
  [key: string]: unknown;
}

export interface RunExecutionState {
  run?:
    | (Pick<
        RunReport,
        "id" | "runId" | "projectId" | "status" | "startedAt" | "finishedAt" | "errorMessage"
      > & {
        lastHeartbeatAt?: string | null;
        attemptCount?: number;
      })
    | null;
  events: Array<{
    sequence?: number;
    eventType?: string;
    phase?: string | null;
    timestampMs?: number | null;
    payload?: Record<string, unknown> | null;
    [key: string]: unknown;
  }>;
  checkpoints: Array<{
    sequence?: number;
    checkpointType?: string;
    eventSequence?: number | null;
    state?: Record<string, unknown> | null;
    [key: string]: unknown;
  }>;
}

export interface QaLiveState {
  run: {
    id: string;
    projectId: string;
    workspaceId: string;
    targetUrl: string;
    status: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    currentPhase?: string | null;
    currentRoute?: string | null;
    currentViewport?: Record<string, unknown> | null;
    viewportMatrix?: V2Viewport[];
    resumable?: boolean;
    legalHold?: boolean;
    stopReason?: string | null;
    errorMessage?: string | null;
  };
  note: {
    markdown: string;
    source: "DURABLE_QA_EVENTS" | string;
    redactionStatus: string;
    redactionVersion: string;
  };
  persistence: {
    health: "healthy" | "degraded" | string;
    latestEventSequence: number;
    latestSyncedSequence: number;
    backlog: number;
    lastSyncedAt?: string | null;
    projection?: {
      sourceSequence: number;
      objectVersion?: string | null;
      contentHash: string;
      byteSize: number;
      status: string;
      lastGeneratedAt?: string | null;
      lastSyncedAt?: string | null;
    } | null;
  };
  checkpoints: Array<{
    id: string;
    sequence: number;
    eventSequence: number;
    checkpointType: string;
    route?: string | null;
    uiStateSummary?: string | null;
    pendingAction?: string | null;
    planRevision?: string | null;
    coverageWatermark: number;
    evidenceWatermark: number;
    localSpoolWatermark: number;
    r2SyncWatermark: number;
    resumable: boolean;
    reason?: string | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    sequence: number;
    eventType: string;
    phase?: string | null;
    timestampMs: number;
    payload?: Record<string, unknown> | null;
    actionSummary?: string | null;
    outcome?: string | null;
    route?: string | null;
    evidenceIds?: unknown;
    coverageIds?: unknown;
    findingIds?: unknown;
    nextDecision?: string | null;
    redactionStatus: string;
    createdAt: string;
  }>;
}

export interface RunAssertion {
  name: string;
  expected: unknown;
  actual: unknown;
  status: "passed" | "failed" | string;
  timestamp: number;
  source?: "AI" | "SYSTEM" | "POLICY" | "USER" | string;
  observationId?: string;
  evidenceRefs?: string[];
}

export interface RunChapter {
  title: string;
  startTimestamp: number;
}
export interface RunScreenshot {
  filename: string;
  timestamp: number;
  t?: number;
  label: string;
  url?: string;
  annotatedFilename?: string;
  annotatedUrl?: string | null;
  annotationStatus?: "APPLIED" | "SKIPPED" | string;
  annotationBox?: { x: number; y: number; width: number; height: number };
  viewport?: { width: number; height: number; deviceMode?: string; isMobile?: boolean };
  redactionStatus?: string;
  redactionDetectorCount?: number;
  ocrUsed?: boolean;
}
export interface RunError {
  subtype: string;
  timestamp: number;
  message: string;
  status?: number;
  target?: string;
  x?: number;
  y?: number;
}
export interface RunSummary {
  assertionsPassed: number;
  assertionsFailed: number;
  hardErrorCount: number;
  bugCount: number;
}

export type VideoArtifactStatus = "not_available" | "ready" | "raw_only" | "failed";

export interface ArtifactStatus {
  video?: {
    status?: VideoArtifactStatus;
    finalUploaded?: boolean;
    rawUploaded?: boolean;
    error?: string;
    reason?: string;
  };
  artifactError?: string | null;
}

export type V2EnvironmentKind = "PREVIEW" | "STAGING" | "PRODUCTION";
export type V2MissionAccessMode = "ANONYMOUS" | "TEST_ACCOUNT" | "BROWSER_HANDOFF";
export interface V2MissionSpec {
  version: "mission-v1";
  goal: string;
  accessMode: V2MissionAccessMode;
  riskPolicy: "SAFE_ADAPTIVE";
}
export interface V2CoverageFrontierItem {
  id: string;
  kind: "ROUTE" | "ACTION";
  route: string;
  actionKey?: string;
  label: string;
  tier: V2PolicyTier;
  priority: number;
  status: "UNTESTED" | "BLOCKED";
  reason: string;
}
export interface V2CoverageFrontier {
  items?: V2CoverageFrontierItem[];
  counts: { total: number; untested: number; blocked: number };
}
export type V2ScanStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type V2PlannerMode = "QUICK_SMOKE" | "STANDARD_ADAPTIVE" | "DEEP_MATRIX";
export type V2ViewportCategory = "desktop" | "tablet" | "mobile";
export interface V2Viewport {
  id: string;
  label: string;
  category: V2ViewportCategory;
  preset: string;
  width: number;
  height: number;
  order: number;
}

export const normalizeV2PlannerMode = (value: string | null | undefined): V2PlannerMode => {
  switch (
    String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[ -]+/g, "_")
  ) {
    case "STANDARD_ADAPTIVE":
      return "STANDARD_ADAPTIVE";
    case "DEEP_MATRIX":
      return "DEEP_MATRIX";
    case "QUICK_SMOKE":
      return "QUICK_SMOKE";
    default:
      return "QUICK_SMOKE";
  }
};
export type V2PlanStatus =
  | "DRAFT"
  | "READY"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";
export type V2PolicyTier = "SAFE" | "CAUTION" | "DANGEROUS" | "UNKNOWN";
export type V2PolicyStatus =
  "PENDING" | "ALLOWED" | "BLOCKED" | "APPROVED" | "REJECTED" | "NEEDS_HUMAN_REVIEW";
export type V2CaseStatus =
  | "PLANNED"
  | "QUEUED"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "WARNING"
  | "SKIPPED"
  | "BLOCKED"
  | "FLAKY"
  | "NEEDS_REVIEW";

export type V2EnvironmentHealthStatus = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
export type V2FixtureStrategy = "MANUAL" | "HTTP_HOOK" | "DATABASE_SNAPSHOT";
export type V2FixtureStatus = "DRAFT" | "ACTIVE" | "DISABLED";
export type V2DependencyKind = "HTTP" | "DATABASE" | "QUEUE" | "EMAIL" | "PAYMENT" | "OTHER";
export type V2DependencyStatus = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
export interface V2EnvironmentDependency {
  id: string;
  environmentId: string;
  name: string;
  kind: V2DependencyKind;
  checkPath: string;
  expectedStatus?: number | null;
  status: V2DependencyStatus;
  lastCheckedAt?: string | null;
  lastLatencyMs?: number | null;
  lastError?: string | null;
}
export interface V2EnvironmentSnapshot {
  id: string;
  environmentId: string;
  label: string;
  configFingerprint: string;
  dependencyFingerprint: string;
  createdAt?: string;
}
export interface V2Environment {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  name: string;
  kind: V2EnvironmentKind;
  baseUrl: string;
  description?: string | null;
  allowedHostnames?: unknown;
  httpHeaders?: Array<{ key: string; hasValue: boolean; valueMasked: string }>;
  healthChecks?: unknown;
  expectedConfig?: unknown;
  healthStatus?: V2EnvironmentHealthStatus;
  lastHealthCheckedAt?: string | null;
  lastHealthError?: string | null;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface EnvironmentSecretMetadata {
  id: string;
  environmentId: string;
  key: string;
  lastUsedAt?: string | null;
}
export interface EnvironmentSecretWrite {
  key: string;
  value: string;
}
export interface EnvironmentHttpHeaderWrite {
  key: string;
  value: string;
}
export type ProjectRoleType = "GUEST" | "AUTHENTICATED";
export type ProjectRoleSessionStatus = "UNVERIFIED" | "ACTIVE" | "EXPIRED" | "INVALID_CREDENTIALS";
export interface ProjectRole {
  id: string;
  projectId: string;
  environmentId: string;
  name: string;
  roleType: ProjectRoleType;
  loginUrl: string;
  verificationUrl: string;
  usernameSelector?: string | null;
  passwordSelector?: string | null;
  submitSelector?: string | null;
  sessionStatus: ProjectRoleSessionStatus;
  lastVerifiedAt?: string | null;
  bootstrapScreenshotData?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export interface V2TestDataFixture {
  id: string;
  organizationId: string;
  workspaceId: string;
  projectId: string;
  environmentId?: string | null;
  name: string;
  description?: string | null;
  strategy: V2FixtureStrategy;
  status: V2FixtureStatus;
  maskedFields?: unknown;
  lastValidationStatus?: string | null;
  lastValidationError?: string | null;
  lastValidatedAt?: string | null;
  lastExecutedAt?: string | null;
  lastExecutionStatus?: string | null;
  lastExecutionError?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
export type V2FindingWorkflowStatus =
  "OPEN" | "IN_PROGRESS" | "FIXED_PENDING_RETEST" | "VERIFIED_FIXED" | "REOPENED" | "WONT_FIX";
export interface V2FindingRetest {
  id: string;
  workflowId: string;
  runId: string;
  verdict: "PASSED" | "FAILED";
  summary?: string | null;
  evidenceIdsJson?: unknown;
  createdAt?: string;
}
export interface V2FindingWorkflow {
  id: string;
  projectId: string;
  failureSignatureId?: string | null;
  title: string;
  status: V2FindingWorkflowStatus;
  issueKey?: string | null;
  issueUrl?: string | null;
  ownerId?: string | null;
  expectedBehavior?: string | null;
  actualBehavior?: string | null;
  remediationNote?: string | null;
  retests?: V2FindingRetest[];
  createdAt?: string;
  updatedAt?: string;
}
export type QuickScanFindingCategory = "meta" | "accessibility" | "links" | "content";
export interface QuickScanFinding {
  category: QuickScanFindingCategory;
  code: string;
  title: string;
  evidence: string;
}
export interface OnboardingQuickScanResult {
  status: "COMPLETED" | "FAILED";
  targetUrl: string;
  finalUrl: string | null;
  targetOrigin: string;
  httpStatus: number | null;
  checkedAt: string;
  findings: QuickScanFinding[];
  findingCount: number;
  summary: string | null;
  summaryStatus: "AI_GENERATED" | "UNAVAILABLE";
  errorMessage?: string;
}

export interface V2AiEnrichment {
  enabled: boolean;
  degraded: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd?: number;
  };
  reason?: string;
}

export interface V2WebPrecheck {
  status: "PASS" | "FAIL";
  targetUrl: string;
  finalUrl?: string | null;
  targetOrigin: string;
  reachable: boolean;
  httpStatus?: number | null;
  httpStatusOk: boolean;
  redirectCount: number;
  robots: {
    checked: boolean;
    status?: number | null;
    sitemapUrls: string[];
    disallowRules: number;
  };
  sitemap: { checked: boolean; status?: number | null; url?: string | null; routeCount: number };
  publicRouteCount: number;
  publicRoutes: string[];
  errors: string[];
  checkedAt: string;
}

export type V2JourneyGraphState = {
  id: string;
  kind: "route" | "interaction" | "review";
  route?: string;
  title?: string;
  target?: string;
  features?: string[];
  evidenceRef?: string;
  tier?: V2PolicyTier;
  reason?: string;
};
export type V2JourneyGraphTransition = {
  id: string;
  from: string;
  to: string;
  trigger: string;
  tool: "open_observed_route" | "click_approved_action" | "review";
  approved: boolean;
};
export type V2JourneyGraph = {
  version: 1;
  startStateId: string;
  states: V2JourneyGraphState[];
  transitions: V2JourneyGraphTransition[];
  counts: { routes: number; interactions: number; reviewRequired: number; transitions: number };
  generatedFrom: "READ_ONLY_DISCOVERY";
};
export type V2MatrixProfile = {
  id: string;
  role: "ANONYMOUS" | "TEST_ACCOUNT" | "BROWSER_HANDOFF";
  device: "DESKTOP" | "MOBILE";
  browser: "CHROMIUM";
  network: "DEFAULT";
  dataState: "PUBLIC_OR_EMPTY" | "FIXTURE";
  edgeCase: "NONE" | "RESPONSIVE_LAYOUT";
  priorityScore: number;
  rationale: string;
  executable: true;
  generatedFrom: "DETERMINISTIC_MATRIX_V1";
};
export type V2MatrixSummary = {
  version: 1;
  mode: V2PlannerMode;
  profiles: V2MatrixProfile[];
  counts: {
    total: number;
    roles: number;
    devices: number;
    browsers: number;
    networks: number;
    dataStates: number;
    edgeCases: number;
  };
  dimensions: {
    role: V2MatrixProfile["role"][];
    device: V2MatrixProfile["device"][];
    browser: V2MatrixProfile["browser"][];
    network: V2MatrixProfile["network"][];
    dataState: V2MatrixProfile["dataState"][];
    edgeCase: V2MatrixProfile["edgeCase"][];
  };
  pruned: Array<{ dimension: string; value: string; reason: string }>;
  generatedFrom: "OBSERVED_PLAN_AND_EXECUTION_CAPABILITIES";
  baseScenarioCount?: number;
  expandedScenarioCount?: number;
};

export interface V2ApplicationScan {
  id: string;
  projectId: string;
  environmentId?: string | null;
  status: V2ScanStatus;
  targetUrl: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  summary?:
    | (Record<string, unknown> & {
        aiEnrichment?: V2AiEnrichment;
        precheck?: V2WebPrecheck;
        progress?: {
          phase?:
            | "PRECHECK"
            | "BROWSER_START"
            | "MAPPING"
            | "AI_ENRICHMENT"
            | "FINALIZING"
            | "COMPLETED"
            | "FAILED"
            | string;
          pagesScanned?: number;
          maxPages?: number;
          queuedUrls?: number;
          lastRoute?: string;
          updatedAt?: string;
        };
      })
    | null;
  projectMap?: {
    targetOrigin?: string;
    precheck?: V2WebPrecheck;
    mission?: V2MissionSpec;
    coverageFrontier?: V2CoverageFrontier;
    journeyGraph?: V2JourneyGraph;
    matrixSummary?: V2MatrixSummary;
    features?: string[];
    scannedPages?: Array<{
      url: string;
      route: string;
      title: string;
      features?: string[];
      authSignals?: Record<string, boolean>;
    }>;
    actions?: Array<{
      key: string;
      text: string;
      tag: string;
      tier: V2PolicyTier;
      reason: string;
      locatorCandidates?: Array<Record<string, string>>;
    }>;
    riskSummary?: { safe: number; caution: number; dangerous: number };
    httpErrors?: Array<{ status: number; url: string }>;
    aiEnrichment?: V2AiEnrichment;
  } | null;

  errorMessage?: string | null;
  createdAt?: string;
}
export interface V2PolicyDecision {
  id: string;
  scenarioId?: string | null;
  actionKey: string;
  intent: string;
  tier: V2PolicyTier;
  status: V2PolicyStatus;
  reason?: string | null;
}
export interface V2Scenario {
  id: string;
  featureId?: string | null;
  name: string;
  intent: string;
  expectedOutcome: string;
  priority: number;
  status: V2CaseStatus;
  caseStatus?: V2CaseStatus | null;
  steps?: unknown;
  locators?: unknown;
  journeyGraph?: unknown;
  result?: unknown;
  viewportResults?: Array<{
    testCaseId: string;
    status: V2CaseStatus;
    device?: string | null;
    browser?: string | null;
    network?: string | null;
    result?: unknown;
    viewport?: V2Viewport | null;
  }>;
}
export interface V2AiPlanSummary {
  source?: string;
  provider?: string;
  model?: string;
  configVersion?: number;
  missionSummary?: string;
  planningRationale?: string;
  uncoveredAreas?: string[];
}

export interface V2TestPlan {
  id: string;
  projectId: string;
  environmentId?: string | null;
  fixtureId?: string | null;
  name: string;
  mode: V2PlannerMode;
  status: V2PlanStatus;
  version: string;
  estimatedUnits?: number | null;
  reservedUnits?: number | null;
  plannerSource?: string | null;
  plannerProvider?: string | null;
  plannerModel?: string | null;
  plannerConfigVersion?: number | null;
  plannerRationale?: string | null;
  plannerEvidence?: unknown;
  plannerValidation?: {
    status?: string;
    scenarioCount?: number;
    candidateCount?: number;
    viewportCount?: number;
    deterministicPolicyAuthority?: boolean;
  } | null;
  projectMap?: {
    mission?: V2MissionSpec;
    journeyGraph?: V2JourneyGraph;
    matrixSummary?: V2MatrixSummary;
    coverageFrontier?: V2CoverageFrontier;
    aiPlan?: V2AiPlanSummary;
    viewportMatrix?: V2Viewport[];
    billingBreakdown?: {
      baseScenarioUnits: number;
      viewportCount?: number;
      viewportMatrix?: V2Viewport[];
      aiDiscoveryUnits: number;
      aiPlanningUnits?: number;
      aiTotalUnits?: number;
      estimatedUnits: number;
      reservationUnits?: number;
      accounting?: string;
    };
  } | null;
  createdAt?: string;
  updatedAt?: string;
  scenarios: V2Scenario[];
  policyDecisions: V2PolicyDecision[];
  testCases?: Array<{
    id: string;
    scenarioId: string;
    status: V2CaseStatus;
    role?: string | null;
    device?: string | null;
    browser?: string | null;
    network?: string | null;
    dataState?: string | null;
    result?: unknown;
    viewport?: V2Viewport | null;
  }>;
}

export interface RunOutcome {
  status:
    | "COMPLETED"
    | "PASSED_WITH_FINDINGS"
    | "PARTIALLY_TESTED"
    | "BLOCKED"
    | "REVIEW_REQUIRED"
    | "AWAITING_PERMISSION"
    | "FAILED"
    | string;
  reasonCode?: string | null;
  message?: string | null;
  coverage?: { planned: number; completed: number; blocked: number; needsReview: number };
  findings?: { target: number; evidence: number };
}

export interface BrowserHandoff {
  id: string;
  runId: string;
  status: "PENDING" | "CLAIMED" | "COMPLETED" | "CANCELLED" | "EXPIRED" | string;
  reason?: string | null;
  expiresAt: string;
  claimedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  hasCredentials?: boolean;
  targetHost?: string | null;
}

export interface AiSummaryEvidenceRef {
  id: string;
  type: "SCREENSHOT" | "OBSERVATION" | "EVENT" | "NETWORK" | "DOM";
  label: string;
}

export interface AiLiveSummary {
  source: "AI";
  generatedAt: string;
  headline: string;
  message: string;
  currentObjective: string;
  whatChanged: string[];
  findingsSoFar: string[];
  blockers: string[];
  nextStep: string;
  confidence: number;
  evidenceRefs: AiSummaryEvidenceRef[];
}

export interface AiRunOverview {
  source: "AI";
  generatedAt: string;
  headline: string;
  summary?: string;
  whatWasTested: unknown[];
  whatTheAgentDid: unknown[];
  findings: Array<{
    severity: string;
    title: string;
    explanation: string;
    evidence: AiSummaryEvidenceRef[];
  }>;
  coverage: unknown;
  blockers: string[];
  recommendedNextSteps: string[];
  scenarioVerdicts: Array<{
    scenarioId: string;
    verdict: "PASSED" | "FAILED" | "INCONCLUSIVE";
    reason: string;
    evidence: AiSummaryEvidenceRef[];
  }>;
}

export type RunQueueState =
  | "REQUESTED"
  | "QUEUED"
  | "WAITING_FOR_PROVIDER"
  | "WAITING_FOR_ORGANIZATION"
  | "ADMITTED"
  | "RUNNING"
  | "EXPIRED";

export interface RunQueueMetadata {
  state: RunQueueState;
  requestedAt: string;
  queuedAt?: string;
  admittedAt?: string;
  startedAt?: string;
  retryAt?: string;
  expiresAt: string;
  provider?: string;
  reason?: string;
  organizationId?: string;
  workspaceId?: string;
  position?: number;
}

export interface RunReport {
  id?: string;
  runId?: string;
  projectId?: string;
  status: string;
  errorMessage?: string | null;
  incomplete?: boolean;
  reportReady?: boolean;
  outcome?: RunOutcome | null;
  targetUrl?: string;
  startedAt?: string | Date;
  finishedAt?: string | Date;
  durationSec?: number;
  triggeredBy?: { id?: string; name?: string | null; email?: string | null } | string | null;
  passed?: number;
  failed?: number;
  bugs?: number;
  scenarios?: number;
  summary?: RunSummary;
  liveAiSummary?: AiLiveSummary | null;
  aiOverview?: AiRunOverview | null;
  quickScan?: {
    status: "COMPLETED" | "FAILED";
    targetUrl: string;
    finalUrl: string;
    checkedAt: string;
    httpStatus: number | null;
    findings: Array<{ category: string; code: string; title: string; evidence: string }>;
    findingCount: number;
    summary: string;
    source: "GLOBAL_RUN_STEP_0";
    errorMessage?: string;
  } | null;
  quickScanHandoff?: QuickScanHandoff | null;
  controlPlane?: {
    disposition?: "TRUSTED" | "WARNING" | "UNVERIFIED";
    environment?: {
      id?: string;
      name?: string;
      kind?: string;
      healthStatus?: string;
      passedChecks?: number;
      totalChecks?: number;
      requestedTargetMatches?: boolean;
    };
    dependencies?: { status?: string; total?: number; healthy?: number };
    fixture?: {
      id?: string;
      name?: string;
      strategy?: string;
      status?: string;
      validationStatus?: string;
      executable?: boolean;
    };
  } | null;
  aiSummaryBillableMatrixUnits?: number;
  events?: RunEvent[];
  assertions?: RunAssertion[];
  chapters?: RunChapter[];
  screenshots?: RunScreenshot[];
  errors?: RunError[];
  evidenceFiles?: Record<string, string | null>;
  finalVideo?: string | null;
  rawVideo?: string | null;
  artifactStatus?: ArtifactStatus;
  metadata?: {
    queue?: RunQueueMetadata;
    providerCapacity?: ProviderCapacityDecision;
    runCapabilities?: { enableVision?: boolean; enableRecovery?: boolean };
    quickScanHandoff?: QuickScanHandoff | null;
    [key: string]: unknown;
  } | null;
  v2Plan?: V2TestPlan | null;
  evidenceLog?: string | null;
  auditLog?: string | null;
  homepage?: string | null;
  afterNavigation?: string | null;
  [key: string]: unknown;
}

export const authApi = {
  ping: async (): Promise<BackendHealthResponse> =>
    apiRequest("/health", { cache: "no-store", timeoutMs: 10_000 }),
  signup: async (data: SignUpRequest): Promise<SignUpResponse> =>
    apiRequest("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  verifyEmail: async (data: VerifyEmailRequest): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.accessToken) setAuthToken(response.accessToken);
    return response;
  },
  resendVerification: async (data: { email: string }): Promise<{ message: string }> =>
    apiRequest("/auth/resend-verification", { method: "POST", body: JSON.stringify(data) }),
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
    if (response.accessToken) setAuthToken(response.accessToken);
    return response;
  },
  getCurrentUser: (): Promise<CurrentUserResponse> =>
    apiRequest("/auth/me", { requiresAuth: true }),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    apiRequest<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  logoutAll: async () => {
    const response = await apiRequest<{ message: string }>("/auth/logout-all", {
      method: "POST",
      requiresAuth: true,
    });
    clearAuthToken();
    return response;
  },
  requestPasswordReset: (email: string) =>
    apiRequest<{ message: string }>("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (data: { token: string; newPassword: string }) =>
    apiRequest<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  requestEmailChange: (data: { newEmail: string; currentPassword: string }) =>
    apiRequest<{ message: string }>("/auth/request-email-change", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  confirmEmailChange: (token: string) =>
    apiRequest<{ message: string }>("/auth/confirm-email-change", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  oauthProviders: (): Promise<{ google: boolean; github: boolean }> =>
    apiRequest("/auth/providers"),
  loginWithGithub: (): void => {
    window.location.href = `${API_BASE_URL}/auth/github`;
  },
  loginWithGoogle: (): void => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  },
  handleOAuthCallback: async (
    code: string,
    provider: string,
    state: string,
  ): Promise<AuthResponse> => {
    const params = new URLSearchParams({ code, provider, state });
    const response = await apiRequest<AuthResponse>(`/auth/oauth/callback?${params.toString()}`);
    if (response.accessToken) setAuthToken(response.accessToken);
    return response;
  },
};

export const plansApi = {
  effective: (organizationId?: string): Promise<EffectivePlanResponse> => {
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    return apiRequest(`/plans/effective${query}`, { requiresAuth: true, cache: "no-store" });
  },
};

export const organizationsApi = {
  list: (): Promise<Organization[]> => apiRequest("/organizations", { requiresAuth: true }),
  create: (data: CreateOrganizationRequest): Promise<Organization> =>
    apiRequest("/organizations", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  get: (id: string): Promise<Organization> =>
    apiRequest(`/organizations/${encodeURIComponent(id)}`, { requiresAuth: true }),
  rename: (id: string, name: string): Promise<Organization> =>
    apiRequest(`/organizations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
      requiresAuth: true,
    }),
  removeMember: (id: string, memberId: string) =>
    apiRequest<{ message: string }>(
      `/organizations/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
      { method: "DELETE", requiresAuth: true },
    ),
  remove: (id: string) =>
    apiRequest<Organization>(`/organizations/${encodeURIComponent(id)}`, {
      method: "DELETE",
      requiresAuth: true,
    }),
};

export const workspacesApi = {
  list: (organizationId: string): Promise<Workspace[]> =>
    apiRequest(`/workspaces?organizationId=${encodeURIComponent(organizationId)}`, {
      requiresAuth: true,
    }),
  create: (data: CreateWorkspaceRequest): Promise<Workspace> =>
    apiRequest("/workspaces", { method: "POST", body: JSON.stringify(data), requiresAuth: true }),
  get: (id: string): Promise<Workspace> =>
    apiRequest(`/workspaces/${encodeURIComponent(id)}`, { requiresAuth: true }),
  rename: (id: string, name: string): Promise<Workspace> =>
    apiRequest(`/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
      requiresAuth: true,
    }),
  remove: (id: string) =>
    apiRequest<Workspace>(`/workspaces/${encodeURIComponent(id)}`, {
      method: "DELETE",
      requiresAuth: true,
      timeoutMs: 120_000,
    }),
  deleteData: (
    id: string,
  ): Promise<{
    workspaceId: string;
    deletedRuns: number;
    r2ObjectsDeleted: number;
    databaseRecordsDeleted: number;
    preservedCreditLedgerEntries: number;
    workspaceMemoryEntriesDeleted: number;
    globalContributionsDeleted: number;
    workspaceDeleted: boolean;
  }> =>
    apiRequest<{
      workspaceId: string;
      deletedRuns: number;
      r2ObjectsDeleted: number;
      databaseRecordsDeleted: number;
      preservedCreditLedgerEntries: number;
      workspaceMemoryEntriesDeleted: number;
      globalContributionsDeleted: number;
      workspaceDeleted: boolean;
    }>(`/workspaces/${encodeURIComponent(id)}/data`, {
      method: "DELETE",
      requiresAuth: true,
      timeoutMs: 120_000,
    }),
};

export interface CreditsSummary {
  symbol: string;
  unitsPerInternalCredit: number;
  message: string;
  allocatedUnits: number;
  bonusUnits: number;
  reservedUnits: number;
  settledUnits: number;
  refundedUnits: number;
  usedUnits: number;
  availableUnits: number;
  monthlyCeilingUnits: number;
  periodStart: string;
  periodEnd: string;
  usagePercent: number;
  warningLevel: 0 | 70 | 85 | 100;
}

export interface CreditsLedgerEntry {
  id: string;
  workspaceId?: string | null;
  runId?: string | null;
  entryType: string;
  units: number;
  internalCredits: number;
  reason: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface AllocationExtensionRequest {
  id: string;
  workspaceId: string;
  requestedUnits: number;
  reason: string;
  status: string;
  staffNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export const creditsApi = {
  topUpOptions: (): Promise<MatrixUnitTopUpCatalog> =>
    apiRequest("/credits/top-up-options", { requiresAuth: true, cache: "no-store" }),
  getSummary: (organizationId: string): Promise<CreditsSummary> =>
    apiRequest(`/credits/organizations/${encodeURIComponent(organizationId)}/summary`, {
      requiresAuth: true,
    }),
  getLedger: (organizationId: string): Promise<CreditsLedgerEntry[]> =>
    apiRequest(`/credits/organizations/${encodeURIComponent(organizationId)}/ledger`, {
      requiresAuth: true,
    }),
  getRequests: (organizationId: string): Promise<AllocationExtensionRequest[]> =>
    apiRequest(`/credits/organizations/${encodeURIComponent(organizationId)}/requests`, {
      requiresAuth: true,
    }),
  requestExtension: (
    organizationId: string,
    workspaceId: string,
    data: { requestedUnits: number; reason: string },
  ): Promise<AllocationExtensionRequest> =>
    apiRequest(
      `/credits/organizations/${encodeURIComponent(organizationId)}/workspaces/${encodeURIComponent(workspaceId)}/requests`,
      { method: "POST", body: JSON.stringify(data), requiresAuth: true },
    ),
};

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface GuidanceMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GuidanceResponse {
  answer: string;
  degraded: boolean;
  available: boolean;
  workspaceId?: string | null;
  workspaceName?: string | null;
  intent?: string;
  workspaceSelectionRequired?: boolean;
  availableWorkspaces?: Array<{ id: string; name: string }>;
  navigation?: { runId?: string; path?: string };
  memoryScope?: string;
  citations?: Array<{ sourceId: string; claim: string }>;
}

export interface GuidanceHistoryResponse {
  workspaceId: string | null;
  messages: Array<GuidanceMessage & { createdAt: string }>;
  redactionPolicyVersion: string;
  persisted: boolean;
}

const normalizeGuidanceMessage = (item: GuidanceMessage): GuidanceMessage => ({
  role: item.role,
  content: item.content.trim().slice(0, 2_000),
});

export const guidanceApi = {
  history: (workspaceId?: string): Promise<GuidanceHistoryResponse> =>
    apiRequest(
      `/guidance/history${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""}`,
      {
        requiresAuth: true,
        cache: "no-store",
      },
    ),
  chat: (
    message: string,
    history: GuidanceMessage[] = [],
    context: { workspaceId?: string; runId?: string } = {},
  ): Promise<GuidanceResponse> =>
    apiRequest("/guidance/chat", {
      method: "POST",
      body: JSON.stringify({
        message: message.trim().slice(0, 2_000),
        history: history.slice(-8).map(normalizeGuidanceMessage),
        ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
        ...(context.runId ? { runId: context.runId } : {}),
      }),
      requiresAuth: true,
    }),
};

export interface WorkspaceMemoryConsent {
  workspaceId: string;
  globalAggregateOptIn: boolean;
  policyVersion: string;
  changedAt: string | null;
}

export const workspaceConsentApi = {
  get: (workspaceId: string): Promise<WorkspaceMemoryConsent> =>
    apiRequest(`/guidance/memory/consent/${encodeURIComponent(workspaceId)}`, {
      requiresAuth: true,
    }),
  update: (workspaceId: string, globalAggregateOptIn: boolean): Promise<WorkspaceMemoryConsent> =>
    apiRequest("/guidance/memory/consent", {
      method: "PATCH",
      body: JSON.stringify({ workspaceId, globalAggregateOptIn }),
      requiresAuth: true,
    }),
};

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export interface PushCapabilities {
  enabled: boolean;
  publicKey: string | null;
}

export const notificationsApi = {
  list: (): Promise<NotificationItem[]> => apiRequest("/notifications", { requiresAuth: true }),
  unreadCount: (): Promise<{ unreadCount: number }> =>
    apiRequest("/notifications/unread-count", { requiresAuth: true }),
  markRead: (id: string) =>
    apiRequest<{ updated: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
      requiresAuth: true,
    }),
  markAllRead: () =>
    apiRequest<{ updatedCount: number }>("/notifications/read", {
      method: "DELETE",
      requiresAuth: true,
    }),
  pushCapabilities: (): Promise<PushCapabilities> =>
    apiRequest("/notifications/push-capabilities", { requiresAuth: true }),
  upsertPushSubscription: (data: PushSubscriptionPayload) =>
    apiRequest<{ subscribed: boolean; enabled: boolean }>("/notifications/push-subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  deletePushSubscription: (endpoint: string) =>
    apiRequest<{ removed: boolean }>("/notifications/push-subscriptions", {
      method: "DELETE",
      body: JSON.stringify({ endpoint }),
      requiresAuth: true,
    }),
};

export type TargetComplaintStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export interface TargetComplaint {
  id: string;
  reporterId?: string;
  projectId?: string | null;
  targetUrl: string;
  reason: string;
  source?: string;
  metadata?: Record<string, unknown> | null;
  status: TargetComplaintStatus;
  staffNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  reporter?: { id: string; email: string; fullName?: string | null; accountStatus?: string };
  project?: { id: string; name: string; organizationId: string } | null;
  reviewedBy?: { id: string; email: string; fullName?: string | null } | null;
  targetSuspended?: boolean;
  suspensionId?: string | null;
}

export interface TargetSuspension {
  id: string;
  normalizedOrigin: string;
  targetUrl: string;
  reason: string;
  status: "ACTIVE" | "REVOKED" | string;
  sourceComplaintId?: string | null;
  createdById: string;
  revokedById?: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string | null;
}

export const targetComplaintsApi = {
  create: (data: {
    targetUrl: string;
    projectId?: string;
    reason: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TargetComplaint> =>
    apiRequest("/target-complaints", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  list: (): Promise<TargetComplaint[]> => apiRequest("/target-complaints", { requiresAuth: true }),
};

export interface AdminCustomerAccount {
  id: string;
  email: string;
  fullName?: string | null;
  emailVerified: boolean;
  accountStatus: "ACTIVE" | "SUSPENDED" | "DISABLED" | string;
  organizationCount: number;
  runCount: number;
  plan: PublicPlan;
  planStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELED" | "INCOMPLETE" | string;
  subscriptionPeriodEnd?: string | null;
  planBadgeColor?: string;
  activeAlpha?: { tier: Exclude<AlphaRewardTier, "NONE">; expiresAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

export type AlphaRewardTier = "NONE" | "ALPHA_PARTICIPANT" | "INTERVIEW_PARTICIPANT" | "WINNER";

export interface AdminAlphaRewardGrant {
  id: string;
  tier: AlphaRewardTier;
  publicTierSnapshot: string;
  startAt: string;
  expiresAt: string;
  grantedAt: string;
  grantReason?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
}

export interface AdminAlphaParticipant {
  id: string;
  email: string;
  fullName?: string | null;
  accountStatus: string;
  alphaRewardTier: AlphaRewardTier;
  alphaRewardStartAt?: string | null;
  alphaRewardExpiresAt?: string | null;
  alphaRewardGrants: AdminAlphaRewardGrant[];
  activeReward?: AdminAlphaRewardGrant | null;
  alphaParticipant?: {
    id: string;
    displayName?: string | null;
    participatedInTesting: boolean;
    tasksCompleted?: string | null;
    importantIssues?: string | null;
    featuresRequested?: string | null;
    likedUseful?: string | null;
    joinedLiveInterview: boolean;
    interviewKeyPoints?: string | null;
    participationQuality?: number | null;
    winnerStatus: boolean;
    feedback: Array<{
      id: string;
      note: string;
      createdAt: string;
      author?: { id: string; fullName?: string | null; email: string } | null;
    }>;
  } | null;
}

export interface AdminWorkforceAgent {
  key: string;
  name: string;
  role: string;
  capabilities: string[];
  maxSlots: number;
}

export interface AdminWorkforceSnapshot {
  id: string;
  runId: string;
  workspaceId: string;
  mode: "QUICK_SMOKE" | "STANDARD_ADAPTIVE" | "DEEP_MATRIX";
  status: "INITIALIZING" | "ACTIVE" | "COMPLETED" | "FAILED" | "STOPPED";
  coordinatorAgentKey: string;
  activeAgentKeys: string[];
  missionSnapshot?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  agents: AdminWorkforceAgent[];
  tasks: Array<{
    id: string;
    taskKey: string;
    agentKey: string;
    requestedByAgentKey: string;
    capability: string;
    objective: string;
    scope: Record<string, unknown>;
    priority: number;
    riskTier: string;
    budgetUnits: number;
    deadlineAt: string;
    status: string;
    result?: unknown;
    evidenceRefs: string[];
    coverageKeys: string[];
    failureReason?: string | null;
    createdAt: string;
    updatedAt: string;
    acceptedAt?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  }>;
  messages: Array<{
    id: string;
    taskId?: string | null;
    messageType: string;
    fromAgentKey: string;
    toAgentKey?: string | null;
    capability?: string | null;
    objective?: string | null;
    scope?: Record<string, unknown> | null;
    priority: number;
    riskTier: string;
    budgetUnits: number;
    deadlineAt?: string | null;
    reason?: string | null;
    evidenceRefs: string[];
    status: string;
    summary: string;
    createdAt: string;
  }>;
  coverageClaims: Array<{
    id: string;
    taskId?: string | null;
    agentKey: string;
    coverageKey: string;
    dimension: string;
    status: string;
    scope: Record<string, unknown>;
    evidenceRefs: string[];
    conflictReason?: string | null;
    claimedAt: string;
    completedAt?: string | null;
  }>;
  capacitySnapshots: Array<{
    id: string;
    agentKey: string;
    maxSlots: number;
    activeSlots: number;
    availableSlots: number;
    capabilities: string[];
    health: string;
    lastHeartbeatAt: string;
    currentTaskIds: string[];
    draining: boolean;
    createdAt: string;
  }>;
}

export interface AdminClientView {
  client: Pick<
    AdminCustomerAccount,
    "id" | "email" | "fullName" | "emailVerified" | "accountStatus" | "createdAt"
  > & { isStaff: boolean };
  organizations: Array<{
    id: string;
    name: string;
    ownerId: string;
    createdAt: string;
    members: Array<{ role: string }>;
    workspaces: Array<{
      id: string;
      name: string;
      createdAt: string;
      projects: Array<{
        id: string;
        name: string;
        defaultTargetUrl?: string | null;
        createdAt: string;
      }>;
    }>;
  }>;
  recentRuns: Array<{
    id: string;
    targetUrl: string;
    status: string;
    type: string;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    errorMessage?: string | null;
    project?: { id: string; name: string } | null;
    workspace?: { id: string; name: string } | null;
  }>;
  readOnly: true;
  viewedAt: string;
}

export interface AdminAllocationRequest {
  id: string;
  requestedUnits: number;
  reason: string;
  status: string;
  staffNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  organization: { id: string; name: string };
  workspace: { id: string; name: string };
  requestedBy: { id: string; email: string; fullName?: string | null };
}

export interface StaffNotificationRecipient {
  id: string;
  email: string;
  label?: string | null;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminOllamaRequestDiagnostic {
  provider: "ollama_cloud";
  method: "GET" | "POST";
  endpoint: string;
  authorization: {
    scheme: "Bearer";
    value: "[REDACTED]";
    keyReference: string;
    keySource: "MANAGED" | "DEPLOYMENT" | "MISSING" | "UNKNOWN";
    keyVersion: number;
    keyLength: number;
    trimmedOuterWhitespace: boolean;
    containsInternalWhitespace: boolean;
    fingerprint: string;
  };
  headers: Record<string, string>;
  body?: {
    contentType: "application/json";
    keys: string[];
    fields: Record<string, unknown>;
  };
}

export interface AdminAiUsageSummary {
  directRunLedger?: {
    totals: { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number };
    measuredRuns: number;
    unmeasuredRuns: number;
    recent: Array<{
      id: string;
      status: string;
      type: string;
      createdAt: string;
      totalAiCalls: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      providersUsed: string[];
      estimatedAiCostUsd: number;
      aiCostCapturedAt?: string | null;
    }>;
  };
  totals: {
    events: number;
    degradedEvents: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
    latencyMs: number;
    averageLatencyMs: number;
    fallbackAttempts?: number;
    accountingSources?: Record<string, number>;
  };
  providers: Array<{
    provider: string;
    model: string;
    events: number;
    degradedEvents: number;
    fallbackAttempts?: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
  }>;
  useCases: Array<{
    useCase: string;
    events: number;
    degradedEvents: number;
    fallbackAttempts?: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
  }>;
  providerChain?: Array<{
    useCase: string;
    chainPosition: number;
    provider: string;
    model: string;
    attempts: number;
    successes: number;
    degradedAttempts: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
  }>;
  providerDiagnostics?: Array<{
    usageEventId: string;
    runId?: string | null;
    provider: string;
    model: string;
    useCase: string;
    chainPosition: number;
    kind: "INVALID_JSON" | "SCHEMA_VALIDATION" | "EMPTY_CONTENT";
    schemaName: string;
    validationError: string;
    responseExcerpt: string;
    capturedAt: string;
    createdAt: string;
    degraded: boolean;
  }>;
  organizations: Array<{
    organizationId: string;
    organizationName: string;
    events: number;
    degradedEvents: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
  }>;
  recent: Array<{
    id: string;
    organizationId: string;
    workspaceId?: string | null;
    projectId?: string | null;
    scanId?: string | null;
    runId?: string | null;
    provider: string;
    model: string;
    useCase?: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    billableMatrixUnits: number;
    latencyMs: number;
    degraded: boolean;
    metadata?: { providerRequests?: AdminOllamaRequestDiagnostic[] } | Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface AdminAiProviderConfig {
  id: string;
  provider:
    | "groq"
    | "openai"
    | "gemini"
    | "openrouter"
    | "anthropic"
    | "zai"
    | "ollama_cloud"
    | "cloudflare_workers_ai"
    | "openai_compatible";
  model: string;
  useCase: "DISCOVERY" | "PLANNING" | "BROWSER_AGENT" | "VISION" | "RECOVERY";
  enabled: boolean;
  priority: number;
  secretRef: string;
  accountId?: string | null;
  secretSource?: "MANAGED" | "DEPLOYMENT" | "POOL" | "MISSING";
  configuredPoolKeys?: number;
  runtimeStatus?: "READY" | "DISABLED" | "MISSING_SECRET";
  baseUrl?: string | null;
  timeoutMs: number;
  maxOutputTokens: number;
  temperature: number;
  estimatedInputUsdPerMillion: number;
  estimatedOutputUsdPerMillion: number;
  matrixUnitSurcharge: number;
  configVersion: number;
  lastHealthStatus?: string | null;
  lastHealthError?: string | null;
  lastHealthCheckedAt?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAiProviderBenchmarkResponse {
  config: AdminAiProviderConfig | null;
  benchmark: {
    sampleCount: number;
    healthySamples: number;
    failedSamples: number;
    successRate: number;
    latencyMs: { min: number; max: number; p50: number; p90: number };
    samples: Array<{ latencyMs: number; healthy: boolean; error?: string | null }>;
  };
  activation: "ELIGIBLE_FOR_REVIEW" | "KEEP_INACTIVE";
}

export interface AdminAiModelCatalogItem {
  id: string;
  name: string;
  provider: AdminAiProviderConfig["provider"];
  status: "ACTIVE" | "PREVIEW" | "UNKNOWN";
  deprecated: boolean;
  expiresAt?: string | null;
  contextLength?: number | null;
  maxOutputTokens?: number | null;
  inputPriceUsdPerMillion?: number | null;
  outputPriceUsdPerMillion?: number | null;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedParameters?: string[];
  compatibility: {
    status: "COMPATIBLE" | "WARNING" | "UNKNOWN" | "INCOMPATIBLE";
    reasons: string[];
  };
}

export interface AdminAiModelCatalogResponse {
  provider: AdminAiProviderConfig["provider"];
  useCase?: AdminAiProviderConfig["useCase"];
  endpoint: string;
  source: "LIVE" | "CURATED";
  fetchedAt: string;
  cached: boolean;
  stale: boolean;
  models: AdminAiModelCatalogItem[];
  warnings: string[];
}

export interface ManagedSecretMetadata {
  id: string;
  name: string;
  description?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  lastHealthStatus?: string | null;
  lastHealthError?: string | null;
  lastHealthCheckedAt?: string | null;
  source: "MANAGED" | "DEPLOYMENT" | "MISSING";
}

export interface ManagedSecretImportResult {
  source: "JSON" | "ENV";
  imported: number;
  rotated: number;
  rejected: number;
  secrets: ManagedSecretMetadata[];
  errors: Array<{ name: string; message: string }>;
}

export interface AdminAuditExport {
  schemaVersion: string;
  generatedAt: string;
  counts: {
    runs: number;
    statuses: Record<string, number>;
    causes: Record<string, number>;
    modes: Record<string, number>;
    telemetryRows: number;
    runsWithTelemetry: number;
    runsWithoutTelemetry: number;
    executionEvents: number;
    aiEvents: number;
    linkedAiEvents: number;
    unlinkedAiEvents: number;
    runsWithAiCost?: number;
    runsWithoutAiCost?: number;
  };
  runs: Array<
    Record<string, unknown> & {
      totalAiCalls?: number;
      totalInputTokens?: number;
      totalOutputTokens?: number;
      providersUsed?: string[];
      estimatedAiCostUsd?: number;
      aiCostCapturedAt?: string | null;
    }
  >;
  telemetry: Array<Record<string, unknown>>;
  aiUsage: { events: Array<Record<string, unknown>> };
}

export type AdminProviderCreditDimension = {
  kind: "REQUESTS" | "TOKENS" | "INPUT_TOKENS" | "OUTPUT_TOKENS" | "CREDITS";
  unit: "requests" | "tokens" | "credits";
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: string | null;
  resetAfterSeconds: number | null;
  source: "PROVIDER_API" | "RESPONSE_HEADERS" | "INTERNAL_USAGE" | "UNAVAILABLE";
};

export type AdminProviderCreditRow = {
  provider: AdminAiProviderConfig["provider"];
  model: string;
  useCases: string[];
  enabled: boolean;
  secretRef: string;
  secretSource: "MANAGED" | "DEPLOYMENT" | "POOL" | "MISSING" | "UNKNOWN";
  configuredPoolKeys: number;
  status: "AVAILABLE" | "RATE_LIMITED" | "ERROR" | "UNAVAILABLE" | "MISSING_SECRET" | "DISABLED";
  checkedAt: string;
  latencyMs: number;
  endpoint: string;
  dimensions: AdminProviderCreditDimension[];
  observed24h: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number };
  warning?: string;
};

export interface AdminProviderCreditSnapshot {
  checkedAt: string;
  cacheTtlSeconds: number;
  rows: AdminProviderCreditRow[];
  notes: string[];
}

export interface AdminTelemetrySummary {
  version: { public: string; build: string };
  providerCapacity?: {
    configuration: {
      provider: string;
      dailyBudget: number;
      organizationSlots: number;
      alphaOrganizations: number;
      protectedReserve: number;
      windowStart: string;
      windowEnd: string;
    };
    window: {
      id: string;
      reservedUnits: number;
      consumedUnits: number;
      releasedUnits: number;
      createdAt: string;
      updatedAt: string;
    } | null;
    reservationsByStatus: Record<
      string,
      { reservations: number; estimatedUnits: number; actualUnits: number }
    >;
  };
  totals: number;
  sums: Record<string, number | null>;
  averages: Record<string, number | null>;
  recent: Array<Record<string, unknown>>;
  aiUsage?: AdminAiUsageSummary;
  creditUsage?: {
    reservedUnits: number;
    reservedInternalCredits: number;
    grossReservedUnits?: number;
    grossReservedInternalCredits?: number;
    settledUnits: number;
    settledInternalCredits: number;
    refundedUnits: number;
    refundedInternalCredits: number;
  };
}

export interface AdminMetricComparison {
  current: number;
  previous: number;
  delta: number;
}
export interface AdminOperationsMetricSnapshot {
  totalRuns: number;
  statusCounts: Record<string, number>;
  terminalRuns: number;
  coveredRuns: number;
  successfulRuns: number;
  findingRuns: number;
  findingRate: number;
  passRate: number;
  repeatRunRate: number;
  averageDurationSec: number;
  averageTimeToFirstReportSec: number;
  queueDepth: number;
  providerExhaustionFrequency: number;
  ai: {
    calls: number;
    tokens: number;
    estimatedCostUsd: number;
    costPerRunUsd: number;
    fallbackRate: number;
  };
  directRunLedger?: {
    measuredRuns: number;
    unmeasuredRuns: number;
    calls: number;
    tokens: number;
    estimatedCostUsd: number;
    costPerRunUsd: number;
  };
}
export interface AdminOperationsMetrics {
  generatedAt: string;
  window: {
    days: number;
    currentFrom: string;
    currentTo: string;
    previousFrom: string;
    previousTo: string;
  };
  current: AdminOperationsMetricSnapshot;
  previous: AdminOperationsMetricSnapshot;
  comparisons: {
    totalRuns: AdminMetricComparison;
    findingRate: AdminMetricComparison;
    repeatRunRate: AdminMetricComparison;
    averageTimeToFirstReportSec: AdminMetricComparison;
    queueDepth: AdminMetricComparison;
    providerExhaustionFrequency: AdminMetricComparison;
    aiCostPerRunUsd: AdminMetricComparison;
  };
  trend: Array<{
    bucketStart: string;
    bucketEnd: string;
    label: string;
    totalRuns: number;
    pending: number;
    running: number;
    completed: number;
    passedWithFindings: number;
    partiallyTested: number;
    blocked: number;
    failed: number;
    queueDepth: number;
  }>;
}

export interface AdminMatrixUnitConfig {
  scopeKey: string;
  version: number;
  enabled: boolean;
  muPriceUsd: number;
  riskBufferRate: number;
  targetMarginRate: number;
  neonCuHourlyUsd: number;
  defaultCuUsed: number;
  renderMonthlyUsd: number;
  vercelMonthlyUsd: number;
  resendMonthlyUsd: number;
  fixedCostRunWindowDays: number;
  r2OperationUsd: number;
  r2StorageUsdPerGbMonth: number;
  defaultMonthlyAllocationMu: number;
  decisionHoldBuffer: number;
  decisionHoldMuPerDecision: number;
  includeExtensionsInHold: boolean;
  modeEstimateRanges: unknown;
}

export interface AdminMatrixUnitRun {
  runId: string;
  workspaceId: string;
  mode: string;
  status: string;
  measurementStatus: string;
  heldMu: number;
  chargedMu: number;
  refundedMu: number;
  actualDecisionCount: number;
  extensionCount: number;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiTotalTokens: number;
  providersUsed: string[];
  aiTotalCostUsd: number;
  internalCostUsd: number;
  sellingPriceUsd: number;
  createdAt: string;
  settledAt?: string | null;
}

export interface AdminMatrixUnitAllocation {
  organizationId: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  regularMu: number;
  bonusMu: number;
  availableMu: number;
  reservedMu: number;
  settledMu: number;
}

export interface AdminMatrixUnitSnapshot {
  generatedAt: string;
  hiddenFromCustomers: true;
  formulaVersion: string;
  exchangeRateUsd: number;
  config: AdminMatrixUnitConfig;
  totals: { heldMu: number; chargedMu: number; refundedMu: number; internalCostUsd: number };
  allocations: AdminMatrixUnitAllocation[];
  recentRuns: AdminMatrixUnitRun[];
}

export interface AdminControlTowerSnapshot {
  generatedAt: string;
  product: { mission: string; runtime: string; deterministicCustomerFallback: boolean };
  users: {
    total: number;
    new24h: number;
    new30d: number;
    recent: Array<{
      id: string;
      email: string;
      fullName?: string | null;
      emailVerified: boolean;
      isStaff: boolean;
      createdAt: string;
      updatedAt: string;
      plan: PublicPlan;
      activeAlpha: { tier: Exclude<AlphaRewardTier, "NONE">; expiresAt: string } | null;
    }>;
    leadTracking: { tracked: boolean; reason?: string };
  };
  organizations: { total: number; new30d: number };
  runs: {
    statusCounts: Record<string, number>;
    recent: Array<{
      id: string;
      projectId: string;
      workspaceId: string;
      triggeredById?: string | null;
      targetUrl: string;
      status: string;
      type: string;
      mode?: string | null;
      createdAt: string;
      startedAt?: string | null;
      finishedAt?: string | null;
      errorMessage?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  };
  queue: {
    pending: number;
    running: number;
    blocked: number;
    failed: number;
    completed: number;
    capacityByStatus: Record<
      string,
      { reservations: number; estimatedUnits: number; actualUnits: number }
    >;
  };
  aiProviders: Array<{
    id: string;
    provider: string;
    model: string;
    useCase: string;
    enabled: boolean;
    priority: number;
    lastHealthStatus?: string | null;
    lastHealthError?: string | null;
    lastHealthCheckedAt?: string | null;
    configVersion: number;
    updatedAt: string;
  }>;
  allocations: { requestsByStatus: Record<string, number> };
  security: {
    unreadNotifications: number;
    recentStaffAuditEvents: Array<{
      id: string;
      eventType: string;
      actorId?: string | null;
      targetUserId?: string | null;
      metadata?: Record<string, unknown> | null;
      createdAt: string;
    }>;
    loginTelemetry: { tracked: boolean; reason?: string };
    countryTelemetry: { tracked: boolean; reason?: string };
  };
  controls: {
    staffAccountDisable: boolean;
    staffSessionRevocation: boolean;
    customerAccountSuspension: boolean;
    customerSessionRevocation: boolean;
    providerConfiguration: boolean;
    allocationReview: boolean;
  };
}

export interface WorkerHealth {
  healthy: boolean;
  activeRuns: number;
  staleRuns: number;
  statusCounts: Array<{ status: string; _count: { _all: number } }>;
  latestRun?: {
    id: string;
    status: string;
    createdAt: string;
    finishedAt?: string | null;
    lastHeartbeatAt?: string | null;
  } | null;
  checkedAt: string;
}

export interface StaffUser {
  id: string;
  email: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  isStaff: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface StaffMembership {
  id: string;
  userId: string;
  role: StaffRole;
  status: StaffMembershipStatus;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string | null;
  user: StaffUser;
  invitedBy?: StaffUser | null;
  disabledBy?: StaffUser | null;
}
export interface StaffInvitation {
  id: string;
  email: string;
  proposedName?: string | null;
  role: StaffRole;
  status: StaffInvitationStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  revokedAt?: string | null;
  inviter?: StaffUser | null;
}
export interface StaffAuditEvent {
  id: string;
  eventType: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: StaffUser | null;
  targetUser?: StaffUser | null;
}
export interface StaffManagementData {
  staff: StaffMembership[];
  invitations: StaffInvitation[];
  audit: StaffAuditEvent[];
}
export interface StaffInvitationPreview {
  valid: boolean;
  message?: string;
  id?: string;
  email?: string;
  proposedName?: string | null;
  role?: StaffRole;
  inviterName?: string;
  expiresAt?: string;
}

export interface ReliabilitySnapshot {
  id: string;
  logicalTestId: string;
  windowType: string;
  windowStart: string;
  windowEnd: string;
  attemptCount: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
  environmentFailureCount: number;
  inconclusiveCount: number;
  passRate?: number | null;
  failureRate?: number | null;
  flakeRate?: number | null;
  trend?: string | null;
  sourceAttemptWatermark: number;
  computedAt: string;
  algorithmVersion: string;
}

export interface ReliabilityAttempt {
  id: string;
  runId: string;
  logicalTestId: string;
  logicalTestVersionId: string;
  attemptNumber: number;
  parentAttemptId?: string | null;
  retryReason?: string | null;
  status: string;
  outcome?: string | null;
  classification?: string | null;
  confidence?: number | null;
  environmentSignatureId?: string | null;
  fixtureSignature?: string | null;
  deploymentId?: string | null;
  commitSha?: string | null;
  evidenceComplete: boolean;
  startedAt?: string | null;
  settledAt?: string | null;
  durationMs?: number | null;
  createdAt: string;
  logicalTest?: { id: string; key: string; name: string; criticality?: string };
  signals?: Array<{
    id: string;
    type: string;
    normalizedSignature: string;
    rawMessageSafe?: string | null;
    route?: string | null;
    confidence?: number | null;
    createdAt: string;
  }>;
}

export interface ReliabilityDashboard {
  generatedAt: string;
  window: { days: number; since: string };
  summary: {
    logicalTestCount: number;
    attemptCount: number;
    comparableAttemptCount: number;
    passRate: number | null;
    flakeRate: number | null;
    unstableLogicalTestCount: number;
    failureCount: number;
    blockedCount: number;
    environmentFailureCount: number;
    inconclusiveCount: number;
  };
  logicalTests: Array<
    Record<string, unknown> & {
      id: string;
      name: string;
      latestSnapshot?: ReliabilitySnapshot | null;
    }
  >;
  attempts: ReliabilityAttempt[];
  failureSignatures: Array<
    Record<string, unknown> & {
      id: string;
      normalizedTitle: string;
      category: string;
      occurrenceCount: number;
      passCount: number;
      failCount: number;
    }
  >;
  quarantines: Array<
    Record<string, unknown> & {
      id: string;
      logicalTestId: string;
      status: string;
      reason: string;
      expiresAt: string;
    }
  >;
  releaseGateDecisions: Array<
    Record<string, unknown> & {
      id: string;
      status: string;
      decisionReason: string;
      decidedAt: string;
    }
  >;
}

export interface StaffReliabilityDashboard {
  generatedAt: string;
  window: { days: number; since: string };
  summary: {
    attemptCount: number;
    passCount: number;
    failCount: number;
    passRate: number | null;
    quarantinedCount: number;
    gateStatusCounts: Record<string, number>;
  };
  attempts: ReliabilityAttempt[];
  failureSignatures: Array<Record<string, unknown>>;
  quarantines: Array<
    Record<string, unknown> & { id: string; status: string; reason: string; expiresAt: string }
  >;
  releaseGateDecisions: Array<
    Record<string, unknown> & {
      id: string;
      status: string;
      decisionReason: string;
      decidedAt: string;
    }
  >;
}

export const reliabilityApi = {
  dashboard: (projectId: string, workspaceId: string, days = 30): Promise<ReliabilityDashboard> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/reliability?workspaceId=${encodeURIComponent(workspaceId)}&days=${encodeURIComponent(String(days))}`,
      { requiresAuth: true, cache: "no-store" },
    ),
  rerun: (
    projectId: string,
    runId: string,
    reason?: string,
  ): Promise<{
    id: string;
    projectId: string;
    status: string;
    rerunOfRunId: string;
    reliability?: Record<string, unknown>;
  }> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/reliability/runs/${encodeURIComponent(runId)}/rerun`,
      {
        method: "POST",
        body: JSON.stringify({
          reason: reason?.trim() || undefined,
          idempotencyKey: `reliability-rerun-${runId}-${Date.now()}`,
        }),
        requiresAuth: true,
        timeoutMs: 30_000,
      },
    ),
  run: (
    runId: string,
  ): Promise<{
    runId: string;
    attempts: ReliabilityAttempt[];
    failureSignatures: Array<Record<string, unknown>>;
    quarantines: Array<Record<string, unknown>>;
    releaseGateDecisions: Array<Record<string, unknown>>;
  }> =>
    apiRequest(`/runs/${encodeURIComponent(runId)}/reliability`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  logicalTestHistory: (logicalTestId: string, workspaceId: string, limit = 50) =>
    apiRequest(
      `/logical-tests/${encodeURIComponent(logicalTestId)}/history?workspaceId=${encodeURIComponent(workspaceId)}&limit=${encodeURIComponent(String(limit))}`,
      { requiresAuth: true, cache: "no-store" },
    ),
  logicalTestSignals: (logicalTestId: string, workspaceId: string, limit = 100) =>
    apiRequest(
      `/logical-tests/${encodeURIComponent(logicalTestId)}/signals?workspaceId=${encodeURIComponent(workspaceId)}&limit=${encodeURIComponent(String(limit))}`,
      { requiresAuth: true, cache: "no-store" },
    ),
  environmentCorrelation: (projectId: string, workspaceId: string) =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/environment-correlation?workspaceId=${encodeURIComponent(workspaceId)}`,
      { requiresAuth: true, cache: "no-store" },
    ),
  evaluateReleaseGate: (runId: string) =>
    apiRequest(`/runs/${encodeURIComponent(runId)}/release-gate/evaluate`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
    }),
  latestReleaseGate: (runId: string) =>
    apiRequest(`/runs/${encodeURIComponent(runId)}/release-gate`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  export: (projectId: string, workspaceId: string) =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/reliability-export?workspaceId=${encodeURIComponent(workspaceId)}`,
      { requiresAuth: true, cache: "no-store" },
    ),
};

export interface AdminRunDiagnosis {
  run: {
    id: string;
    status: string;
    projectId: string;
    projectName: string;
    workspaceId: string;
    organizationId: string;
    targetUrl: string;
    type: string;
    planVersion: string;
    triggeredBy?: { id: string; email: string; fullName?: string | null } | null;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    currentPhase?: string | null;
    currentRoute?: string | null;
    hardErrorCount: number;
    attemptCount: number;
    errorMessage?: string | null;
    stopReason?: string | null;
    totalAiCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    providersUsed: unknown;
    estimatedAiCostUsd: unknown;
  };
  credit: {
    reservedUnits: number;
    settledUnits: number;
    refundedUnits: number;
    consumedUnits: number;
    refundableUnits: number;
    matrixUnits: {
      heldMu: number;
      measuredMu: number;
      chargedMu: number;
      refundedMu: number;
      liveChargedMu: number;
      status: string;
      measurementStatus: string;
    } | null;
  };
  steps: unknown[];
  evidence: unknown[];
  consoleMessages: unknown[];
  executionEvents: unknown[];
  checkpoints: unknown[];
  attempts: unknown[];
  messages: unknown[];
  telemetry: unknown;
  browserHandoff: unknown;
  reports: unknown[];
  workforce: unknown;
  aiUsage: unknown[];
  creditLedger: unknown[];
  matrixUnitLedger: unknown[];
  matrixUnitAccounting: unknown;
  signals: unknown[];
  hardErrors: unknown[];
  findingWorkflows: unknown[];
  findingRetests: unknown[];
  audit: unknown[];
  sourceIds: Record<string, string>;
}

export const adminApi = {
  listCustomerAccounts: (): Promise<AdminCustomerAccount[]> =>
    apiRequest("/admin/customers", { requiresAuth: true }),
  diagnoseRun: (runId: string): Promise<AdminRunDiagnosis> =>
    apiRequest(`/admin/diagnostics/runs/${encodeURIComponent(runId)}`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  refundDiagnosedRun: (runId: string, reason: string) =>
    apiRequest<{
      runId: string;
      refundedUnits: number;
      refundedMu: number;
      idempotent: boolean;
      ledgerEntryId: string | null;
    }>(`/admin/diagnostics/runs/${encodeURIComponent(runId)}/refund`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      requiresAuth: true,
    }),
  messageDiagnosedRun: (
    runId: string,
    data: { recipientUserIds: string[]; title: string; message: string },
  ) =>
    apiRequest<{ runId: string; recipientCount: number; delivered: unknown[] }>(
      `/admin/diagnostics/runs/${encodeURIComponent(runId)}/message`,
      { method: "POST", body: JSON.stringify(data), requiresAuth: true },
    ),
  listAlphaParticipants: (search?: string): Promise<AdminAlphaParticipant[]> =>
    apiRequest(
      `/admin/alpha-event/participants${search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""}`,
      { requiresAuth: true, cache: "no-store" },
    ),
  listWorkforceAgents: (): Promise<AdminWorkforceAgent[]> =>
    apiRequest("/admin/workforce/agents", { requiresAuth: true, cache: "no-store" }),
  workforceRun: (runId: string): Promise<AdminWorkforceSnapshot> =>
    apiRequest(`/admin/workforce/runs/${encodeURIComponent(runId)}`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  approveWorkforceDelegation: (messageId: string, reason?: string): Promise<unknown> =>
    apiRequest(`/admin/workforce/delegations/${encodeURIComponent(messageId)}/approve`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      requiresAuth: true,
    }),
  rejectWorkforceDelegation: (messageId: string, reason?: string): Promise<unknown> =>
    apiRequest(`/admin/workforce/delegations/${encodeURIComponent(messageId)}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      requiresAuth: true,
    }),
  grantAlphaReward: (data: {
    email: string;
    tier: Exclude<AlphaRewardTier, "NONE">;
    startAt?: string;
    reason?: string;
  }): Promise<{
    grant: AdminAlphaRewardGrant;
    user: { id: string; email: string; fullName?: string | null };
    replacedGrantIds: string[];
    unlimitedRuns: boolean;
  }> =>
    apiRequest("/admin/alpha-event/rewards", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  revokeAlphaReward: (
    grantId: string,
    reason?: string,
  ): Promise<{
    id: string;
    revoked: boolean;
    activeReward?: AdminAlphaRewardGrant | null;
    reason?: string;
  }> =>
    apiRequest(`/admin/alpha-event/rewards/${encodeURIComponent(grantId)}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
      requiresAuth: true,
    }),
  updateAlphaParticipant: (
    userId: string,
    data: Partial<Omit<NonNullable<AdminAlphaParticipant["alphaParticipant"]>, "id" | "feedback">>,
  ): Promise<NonNullable<AdminAlphaParticipant["alphaParticipant"]>> =>
    apiRequest(`/admin/alpha-event/participants/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  addAlphaParticipantFeedback: (
    userId: string,
    note: string,
  ): Promise<{
    id: string;
    note: string;
    createdAt: string;
    author?: { id: string; fullName?: string | null; email: string } | null;
  }> =>
    apiRequest(`/admin/alpha-event/participants/${encodeURIComponent(userId)}/feedback`, {
      method: "POST",
      body: JSON.stringify({ note }),
      requiresAuth: true,
    }),
  viewAsClient: (userId: string): Promise<AdminClientView> =>
    apiRequest(`/admin/users/${encodeURIComponent(userId)}/view-as-client`, { requiresAuth: true }),
  changeCustomerAccountStatus: (
    userId: string,
    data: { status: "ACTIVE" | "SUSPENDED" | "DISABLED"; reason?: string },
  ) =>
    apiRequest<AdminCustomerAccount & { sessionsRevoked: boolean }>(
      `/admin/users/${encodeURIComponent(userId)}/status`,
      { method: "PATCH", body: JSON.stringify(data), requiresAuth: true },
    ),
  listAllocationRequests: (status?: string): Promise<AdminAllocationRequest[]> =>
    apiRequest(
      `/admin/allocation-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      { requiresAuth: true },
    ),
  reviewAllocationRequest: (
    id: string,
    data: { status: "APPROVED" | "DECLINED"; staffNote?: string },
  ) =>
    apiRequest<AdminAllocationRequest>(
      `/admin/allocation-requests/${encodeURIComponent(id)}/review`,
      { method: "POST", body: JSON.stringify(data), requiresAuth: true },
    ),
  listRecipients: (): Promise<StaffNotificationRecipient[]> =>
    apiRequest("/admin/notification-recipients", { requiresAuth: true }),
  listManagedSecrets: (): Promise<ManagedSecretMetadata[]> =>
    apiRequest("/admin/secrets", { requiresAuth: true }),
  saveManagedSecret: (data: {
    name: string;
    value: string;
    description?: string;
  }): Promise<ManagedSecretMetadata> =>
    apiRequest("/admin/secrets", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  importManagedSecrets: (data: {
    source: "JSON" | "ENV";
    entries: Array<{ name: string; value: string; description?: string }>;
  }): Promise<ManagedSecretImportResult> =>
    apiRequest("/admin/secrets/import", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  deleteManagedSecret: (name: string): Promise<{ name: string; deleted: boolean }> =>
    apiRequest("/admin/secrets", {
      method: "DELETE",
      body: JSON.stringify({ name }),
      requiresAuth: true,
    }),
  saveRecipient: (data: { email: string; label?: string }) =>
    apiRequest<StaffNotificationRecipient>("/admin/notification-recipients", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  disableRecipient: (id: string) =>
    apiRequest<StaffNotificationRecipient>(
      `/admin/notification-recipients/${encodeURIComponent(id)}`,
      { method: "DELETE", requiresAuth: true },
    ),
  broadcast: (data: { title: string; message: string; audience?: "ALL_USERS" | "STAFF" }) =>
    apiRequest<{ deliveredCount: number; audience: string }>("/admin/notifications/broadcast", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  auditExport: (): Promise<AdminAuditExport> =>
    apiRequest("/admin/audit-export", { requiresAuth: true }),
  telemetry: (): Promise<AdminTelemetrySummary> =>
    apiRequest("/admin/telemetry", { requiresAuth: true }),
  providerCredits: (refresh = false): Promise<AdminProviderCreditSnapshot> =>
    apiRequest(`/admin/provider-credits${refresh ? "?refresh=true" : ""}`, { requiresAuth: true }),
  matrixUnits: (): Promise<AdminMatrixUnitSnapshot> =>
    apiRequest("/admin/matrix-units", { requiresAuth: true }),
  updateMatrixUnitConfig: (
    data: Partial<AdminMatrixUnitConfig> & { workspaceId?: string | null },
  ): Promise<AdminMatrixUnitConfig> =>
    apiRequest("/admin/matrix-units/config", {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  metrics: (days = 7): Promise<AdminOperationsMetrics> =>
    apiRequest(`/admin/metrics?days=${encodeURIComponent(String(days))}`, { requiresAuth: true }),
  reliability: (
    days = 30,
    workspaceId?: string,
    projectId?: string,
  ): Promise<StaffReliabilityDashboard> => {
    const params = new URLSearchParams({ days: String(days) });
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (projectId) params.set("projectId", projectId);
    return apiRequest(`/admin/reliability?${params.toString()}`, {
      requiresAuth: true,
      cache: "no-store",
    });
  },
  reviewReliabilityQuarantine: (
    id: string,
    data: { status: "ACTIVE" | "RESOLVED" | "REJECTED" | "REVOKED"; resolutionNote?: string },
  ): Promise<StaffReliabilityDashboard["quarantines"][number]> =>
    apiRequest(`/admin/reliability/quarantines/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  controlTower: (): Promise<AdminControlTowerSnapshot> =>
    apiRequest("/admin/control-tower", { requiresAuth: true }),
  listTargetComplaints: (status?: TargetComplaintStatus): Promise<TargetComplaint[]> =>
    apiRequest(`/target-complaints/staff${status ? `?status=${encodeURIComponent(status)}` : ""}`, {
      requiresAuth: true,
    }),
  reviewTargetComplaint: (
    id: string,
    data: { status: TargetComplaintStatus; staffNote?: string; suspendTarget?: boolean },
  ): Promise<TargetComplaint> =>
    apiRequest(`/target-complaints/staff/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  listTargetSuspensions: (): Promise<TargetSuspension[]> =>
    apiRequest("/target-complaints/staff/suspensions", { requiresAuth: true }),
  revokeTargetSuspension: (id: string, note?: string): Promise<TargetSuspension> =>
    apiRequest(`/target-complaints/staff/suspensions/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      body: JSON.stringify({ note }),
      requiresAuth: true,
    }),
  listAiProviderConfigs: (): Promise<AdminAiProviderConfig[]> =>
    apiRequest("/admin/ai-provider-configs", { requiresAuth: true }),
  listAiModelCatalog: (params: {
    provider: AdminAiProviderConfig["provider"];
    secretRef: string;
    accountId?: string;
    baseUrl?: string;
    useCase?: AdminAiProviderConfig["useCase"];
    refresh?: boolean;
  }): Promise<AdminAiModelCatalogResponse> => {
    const search = new URLSearchParams({ provider: params.provider, secretRef: params.secretRef });
    if (params.accountId) search.set("accountId", params.accountId);
    if (params.baseUrl) search.set("baseUrl", params.baseUrl);
    if (params.useCase) search.set("useCase", params.useCase);
    if (params.refresh) search.set("refresh", "true");
    return apiRequest(`/admin/ai-provider-configs/catalog?${search.toString()}`, {
      requiresAuth: true,
    });
  },
  saveAiProviderConfig: (
    data: Partial<AdminAiProviderConfig> &
      Pick<AdminAiProviderConfig, "provider" | "model" | "useCase" | "secretRef">,
  ): Promise<AdminAiProviderConfig> =>
    apiRequest("/admin/ai-provider-configs", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  healthCheckAiProviderConfig: (id: string): Promise<AdminAiProviderConfig> =>
    apiRequest(`/admin/ai-provider-configs/${encodeURIComponent(id)}/health-check`, {
      method: "POST",
      requiresAuth: true,
    }),
  benchmarkAiProviderConfig: (id: string, samples = 3): Promise<AdminAiProviderBenchmarkResponse> =>
    apiRequest(`/admin/ai-provider-configs/${encodeURIComponent(id)}/benchmark`, {
      method: "POST",
      body: JSON.stringify({ samples }),
      requiresAuth: true,
    }),
  deleteAiProviderConfig: (id: string): Promise<{ id: string; deleted: boolean }> =>
    apiRequest(`/admin/ai-provider-configs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      requiresAuth: true,
    }),
  workerHealth: (): Promise<WorkerHealth> =>
    apiRequest("/admin/worker-health", { requiresAuth: true }),
  listStaff: (): Promise<StaffManagementData> => apiRequest("/admin/staff", { requiresAuth: true }),
  inviteStaff: (data: {
    emails: string[];
    proposedName?: string;
    role?: StaffRole;
    internalNote?: string;
  }) =>
    apiRequest<{
      results: Array<{ email: string; status: string; invitationId?: string; message?: string }>;
    }>("/admin/staff/invitations", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  resendStaffInvitation: (id: string) =>
    apiRequest<{ id: string; status: StaffInvitationStatus; expiresAt: string }>(
      `/admin/staff/invitations/${encodeURIComponent(id)}/resend`,
      { method: "POST", requiresAuth: true },
    ),
  revokeStaffInvitation: (id: string) =>
    apiRequest<{ id: string; status: StaffInvitationStatus }>(
      `/admin/staff/invitations/${encodeURIComponent(id)}/revoke`,
      { method: "POST", requiresAuth: true },
    ),
  changeStaffRole: (userId: string, role: StaffRole) =>
    apiRequest<StaffMembership>(`/admin/staff/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
      requiresAuth: true,
    }),
  disableStaff: (userId: string) =>
    apiRequest<StaffMembership>(`/admin/staff/${encodeURIComponent(userId)}/disable`, {
      method: "POST",
      requiresAuth: true,
    }),
  enableStaff: (userId: string) =>
    apiRequest<StaffMembership>(`/admin/staff/${encodeURIComponent(userId)}/enable`, {
      method: "POST",
      requiresAuth: true,
    }),
  revokeStaffSessions: (userId: string) =>
    apiRequest<{ message: string }>(`/admin/staff/${encodeURIComponent(userId)}/revoke-sessions`, {
      method: "POST",
      requiresAuth: true,
    }),
};

export const staffInvitationApi = {
  preview: (token: string): Promise<StaffInvitationPreview> =>
    apiRequest(`/staff-invitations/${encodeURIComponent(token)}`),
  accept: (token: string, data: { password?: string; fullName?: string }) =>
    apiRequest<{ message: string; email: string; existingAccount: boolean }>(
      `/staff-invitations/${encodeURIComponent(token)}/accept`,
      { method: "POST", body: JSON.stringify(data) },
    ),
  decline: (token: string) =>
    apiRequest<{ message: string }>(`/staff-invitations/${encodeURIComponent(token)}/decline`, {
      method: "POST",
    }),
};

export const usersApi = {
  getProfile: (): Promise<CurrentUserResponse> => apiRequest("/users/me", { requiresAuth: true }),
  updateProfile: (data: { fullName: string }): Promise<CurrentUserResponse> =>
    apiRequest("/users/me", { method: "PATCH", body: JSON.stringify(data), requiresAuth: true }),
  uploadAvatar: (file: File): Promise<CurrentUserResponse> => {
    const body = new FormData();
    body.append("avatar", file);
    return apiRequest("/users/me/avatar", { method: "POST", body, requiresAuth: true });
  },
  removeAvatar: (): Promise<CurrentUserResponse> =>
    apiRequest("/users/me/avatar", { method: "DELETE", requiresAuth: true }),
};

const sleepForPlanRetry = (milliseconds: number) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

const isRetryablePlanGenerationError = (error: unknown): error is ApiRequestError =>
  error instanceof ApiRequestError && error.status >= 500 && error.status < 600;

export const quickScanApi = {
  run: (data: {
    targetUrl: string;
    ownershipConfirmed: boolean;
  }): Promise<OnboardingQuickScanResult> =>
    apiRequest("/onboarding/quick-scan", {
      method: "POST",
      body: JSON.stringify(data),
      timeoutMs: QUICK_SCAN_TIMEOUT_MS,
    }),
};

export type CustomerWorkerHealthState =
  "HEALTHY" | "DEGRADED" | "STALE" | "DRAINING" | "UNREPORTED" | "STANDBY";
export type CustomerWorkerPoolStatus = "HEALTHY" | "DEGRADED" | "NO_ACTIVE_RUN";
export interface CustomerWorkerHealthAgent {
  key: string;
  name: string;
  role: string;
  capabilities: string[];
  activation: "ACTIVE" | "STANDBY";
  health: CustomerWorkerHealthState;
  healthPercent: number | null;
  lastHeartbeatAt: string | null;
  heartbeatAgeMs: number | null;
  draining: boolean;
  activeSlots: number;
  maxSlots: number;
  availableSlots: number;
  currentTaskCount: number;
  taskCounts: Record<string, number>;
  assignedCapabilities: string[];
}
export interface CustomerWorkerPoolHealth {
  version: "v1";
  observational: true;
  executionModel: "CONTROLLED_SEQUENTIAL_BROWSER_RUNNER";
  workspaceId: string;
  generatedAt: string;
  status: CustomerWorkerPoolStatus;
  healthPercent: number | null;
  run: { id: string | null; mode: string | null; status: string | null; updatedAt: string | null };
  capacity: {
    activeSlots: number;
    maxSlots: number;
    availableSlots: number;
    utilizationPercent: number;
  };
  workers: { registered: number; active: number; idle: number; busy: number; unavailable: number };
  tasks: {
    total: number;
    queued: number;
    accepted: number;
    running: number;
    completed: number;
    failed: number;
    blocked: number;
    needsReview: number;
    muReserved: number;
  };
  agents: CustomerWorkerHealthAgent[];
}

export const v2Api = {
  listRoles: (projectId: string, environmentId: string): Promise<ProjectRole[]> =>
    apiRequest(
      `/roles/project/${encodeURIComponent(projectId)}/environment/${encodeURIComponent(environmentId)}`,
      { requiresAuth: true },
    ),
  createRole: (data: {
    projectId: string;
    environmentId: string;
    name: string;
    roleType: ProjectRoleType;
    loginUrl: string;
    verificationUrl: string;
    username?: string;
    password?: string;
    usernameSelector?: string;
    passwordSelector?: string;
    submitSelector?: string;
  }): Promise<ProjectRole> =>
    apiRequest("/roles", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
      timeoutMs: 60_000,
    }),
  updateRole: (
    roleId: string,
    data: Partial<{
      name: string;
      loginUrl: string;
      verificationUrl: string;
      username: string;
      password: string;
      usernameSelector: string;
      passwordSelector: string;
      submitSelector: string;
    }>,
  ): Promise<ProjectRole> =>
    apiRequest(`/roles/${encodeURIComponent(roleId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
      timeoutMs: 60_000,
    }),
  deleteRole: (roleId: string): Promise<ProjectRole> =>
    apiRequest(`/roles/${encodeURIComponent(roleId)}`, { method: "DELETE", requiresAuth: true }),
  getWorkerPoolHealth: (projectId: string): Promise<CustomerWorkerPoolHealth> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/workforce-health`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  listEnvironments: (projectId: string): Promise<V2Environment[]> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/environments`, { requiresAuth: true }),
  listEnvironmentSecrets: (environmentId: string): Promise<EnvironmentSecretMetadata[]> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/secrets`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  createEnvironmentSecret: (
    environmentId: string,
    data: EnvironmentSecretWrite,
  ): Promise<EnvironmentSecretMetadata> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/secrets`, {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  rotateEnvironmentSecret: (
    environmentId: string,
    key: string,
    value: string,
  ): Promise<EnvironmentSecretMetadata> =>
    apiRequest(
      `/environments/${encodeURIComponent(environmentId)}/secrets/${encodeURIComponent(key)}`,
      {
        method: "PUT",
        body: JSON.stringify({ value }),
        requiresAuth: true,
      },
    ),
  deleteEnvironmentSecret: (environmentId: string, key: string): Promise<void> =>
    apiRequest(
      `/environments/${encodeURIComponent(environmentId)}/secrets/${encodeURIComponent(key)}`,
      { method: "DELETE", requiresAuth: true },
    ),
  createEnvironment: (data: {
    organizationId: string;
    workspaceId: string;
    projectId: string;
    name: string;
    kind?: V2EnvironmentKind;
    baseUrl: string;
    description?: string;
    healthChecks?: unknown[];
    expectedConfig?: unknown;
    allowedHostnames?: unknown;
    httpHeaders?: EnvironmentHttpHeaderWrite[];
  }): Promise<V2Environment> =>
    apiRequest("/environments", { method: "POST", body: JSON.stringify(data), requiresAuth: true }),
  updateEnvironment: (
    environmentId: string,
    data: {
      name?: string;
      kind?: V2EnvironmentKind;
      baseUrl?: string;
      description?: string;
      healthChecks?: unknown[];
      expectedConfig?: unknown;
      allowedHostnames?: unknown;
      httpHeaders?: EnvironmentHttpHeaderWrite[];
    },
  ): Promise<V2Environment> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  archiveEnvironment: (environmentId: string): Promise<V2Environment> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/archive`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
    }),
  restoreEnvironment: (environmentId: string): Promise<V2Environment> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
    }),
  listDependencies: (environmentId: string): Promise<V2EnvironmentDependency[]> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/dependencies`, {
      requiresAuth: true,
    }),
  createDependency: (data: {
    environmentId: string;
    name: string;
    kind?: V2DependencyKind;
    checkPath: string;
    expectedStatus?: number;
  }): Promise<V2EnvironmentDependency> =>
    apiRequest("/environment-dependencies", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  checkDependency: (
    dependencyId: string,
  ): Promise<{
    dependency: V2EnvironmentDependency;
    status: V2DependencyStatus;
    httpStatus: number | null;
    latencyMs: number;
    error: string | null;
  }> =>
    apiRequest(`/environment-dependencies/${encodeURIComponent(dependencyId)}/health-check`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
      timeoutMs: 20_000,
    }),
  checkAllDependencies: (
    environmentId: string,
  ): Promise<{ environmentId: string; total: number; healthy: number; results: unknown[] }> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/dependencies/health-check`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
      timeoutMs: 30_000,
    }),
  listSnapshots: (environmentId: string): Promise<V2EnvironmentSnapshot[]> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/snapshots`, {
      requiresAuth: true,
    }),
  createSnapshot: (environmentId: string, label: string): Promise<V2EnvironmentSnapshot> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/snapshots`, {
      method: "POST",
      body: JSON.stringify({ label }),
      requiresAuth: true,
    }),
  getEnvironmentDrift: (
    environmentId: string,
  ): Promise<{
    status: "NO_BASELINE" | "IN_SYNC" | "DRIFTED";
    environmentId: string;
    latestSnapshot: V2EnvironmentSnapshot | null;
    changed: string[];
  }> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/drift`, { requiresAuth: true }),
  checkEnvironmentHealth: (
    environmentId: string,
  ): Promise<{
    environment: V2Environment;
    status: V2EnvironmentHealthStatus;
    passed: number;
    total: number;
    durationMs: number;
    checks: Array<{
      name: string;
      path: string;
      status: number | null;
      ok: boolean;
      latencyMs: number | null;
      error?: string;
    }>;
  }> =>
    apiRequest(`/environments/${encodeURIComponent(environmentId)}/health-check`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
      timeoutMs: 20_000,
    }),
  listTestDataFixtures: (projectId: string): Promise<V2TestDataFixture[]> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/test-data-fixtures`, {
      requiresAuth: true,
    }),
  createTestDataFixture: (data: {
    projectId: string;
    environmentId?: string;
    name: string;
    description?: string;
    strategy?: V2FixtureStrategy;
    seedSpec?: unknown;
    resetSpec?: unknown;
    maskedFields?: string[];
  }): Promise<V2TestDataFixture> =>
    apiRequest("/test-data-fixtures", {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  updateTestDataFixture: (
    fixtureId: string,
    data: {
      name?: string;
      description?: string;
      strategy?: V2FixtureStrategy;
      status?: V2FixtureStatus;
      seedSpec?: unknown;
      resetSpec?: unknown;
      maskedFields?: string[];
    },
  ): Promise<V2TestDataFixture> =>
    apiRequest(`/test-data-fixtures/${encodeURIComponent(fixtureId)}`, {
      method: "PATCH",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  validateTestDataFixture: (
    fixtureId: string,
  ): Promise<{
    fixture: V2TestDataFixture;
    status: string;
    executable: boolean;
    message: string;
  }> =>
    apiRequest(`/test-data-fixtures/${encodeURIComponent(fixtureId)}/validate`, {
      method: "POST",
      body: JSON.stringify({}),
      requiresAuth: true,
    }),
  executeTestDataFixture: (
    fixtureId: string,
    operation: "seed" | "reset",
    confirmed: boolean,
  ): Promise<{
    fixture: V2TestDataFixture;
    operation: string;
    status: string;
    durationMs: number;
  }> =>
    apiRequest(`/test-data-fixtures/${encodeURIComponent(fixtureId)}/execute`, {
      method: "POST",
      body: JSON.stringify({ operation, confirmed }),
      requiresAuth: true,
      timeoutMs: 20_000,
    }),
  listFindingWorkflows: (
    projectId: string,
    status?: V2FindingWorkflowStatus,
  ): Promise<V2FindingWorkflow[]> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/finding-workflows${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      { requiresAuth: true },
    ),
  createFindingWorkflow: (
    projectId: string,
    data: {
      failureSignatureId?: string;
      title: string;
      issueKey?: string;
      issueUrl?: string;
      ownerId?: string;
      expectedBehavior?: string;
      actualBehavior?: string;
      remediationNote?: string;
    },
  ): Promise<V2FindingWorkflow> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/finding-workflows`, {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  updateFindingWorkflow: (
    projectId: string,
    workflowId: string,
    data: {
      status?: V2FindingWorkflowStatus;
      issueKey?: string;
      issueUrl?: string;
      ownerId?: string;
      remediationNote?: string;
    },
  ): Promise<V2FindingWorkflow> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/finding-workflows/${encodeURIComponent(workflowId)}`,
      { method: "PATCH", body: JSON.stringify(data), requiresAuth: true },
    ),
  createFindingRetest: (
    projectId: string,
    workflowId: string,
    runId: string,
    summary?: string,
  ): Promise<{
    workflow: V2FindingWorkflow;
    retest: V2FindingRetest;
    verdict: string;
    evidenceCount: number;
  }> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/finding-workflows/${encodeURIComponent(workflowId)}/retests`,
      { method: "POST", body: JSON.stringify({ runId, summary }), requiresAuth: true },
    ),
  startScan: (
    projectId: string,
    data: {
      environmentId?: string;
      targetUrl?: string;
      missionGoal?: string;
      accessMode?: V2MissionAccessMode;
    } = {},
  ): Promise<V2ApplicationScan> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scans`, {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  listScans: (projectId: string): Promise<V2ApplicationScan[]> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scans`, { requiresAuth: true }),
  getScan: (scanId: string): Promise<V2ApplicationScan> =>
    apiRequest(`/scans/${encodeURIComponent(scanId)}`, { requiresAuth: true }),
  getJourneyGraph: (
    scanId: string,
  ): Promise<{
    scanId: string;
    projectId: string;
    targetOrigin: string;
    generatedAt?: string | null;
    graph: V2JourneyGraph;
  }> => apiRequest(`/scans/${encodeURIComponent(scanId)}/journey-graph`, { requiresAuth: true }),
  createPlanFromScan: async (
    scanId: string,
    data: {
      name: string;
      mode?: V2PlannerMode | string;
      missionGoal?: string;
      accessMode?: V2MissionAccessMode;
      fixtureId?: string;
    },
  ): Promise<V2TestPlan> => {
    const payload = { ...data, ...(data.mode ? { mode: normalizeV2PlannerMode(data.mode) } : {}) };
    const request = () =>
      apiRequest<V2TestPlan>(`/scans/${encodeURIComponent(scanId)}/plans`, {
        method: "POST",
        body: JSON.stringify(payload),
        requiresAuth: true,
        timeoutMs: PLAN_PREPARATION_TIMEOUT_MS,
      });

    try {
      return await request();
    } catch (error) {
      if (!isRetryablePlanGenerationError(error)) throw error;
      await sleepForPlanRetry(2_500);
      try {
        return await request();
      } catch (retryError) {
        if (!isRetryablePlanGenerationError(retryError)) throw retryError;
        await sleepForPlanRetry(5_000);
        return request();
      }
    }
  },
  getPlan: (planId: string): Promise<V2TestPlan> =>
    apiRequest(`/plans/${encodeURIComponent(planId)}`, { requiresAuth: true }),
  approvePlan: (planId: string): Promise<V2TestPlan> =>
    apiRequest(`/plans/${encodeURIComponent(planId)}/approve`, {
      method: "POST",
      requiresAuth: true,
    }),
  runPlan: (
    planId: string,
    data: TriggerRunRequest = {},
  ): Promise<TriggerRunResponse & { planId?: string }> =>
    apiRequest(`/plans/${encodeURIComponent(planId)}/run`, {
      method: "POST",
      body: JSON.stringify(data),
      requiresAuth: true,
    }),
  approvePolicy: (planId: string, decisionId: string) =>
    apiRequest<V2PolicyDecision>(
      `/plans/${encodeURIComponent(planId)}/policy/${encodeURIComponent(decisionId)}/approve`,
      { method: "POST", requiresAuth: true },
    ),
  rejectPolicy: (planId: string, decisionId: string) =>
    apiRequest<V2PolicyDecision>(
      `/plans/${encodeURIComponent(planId)}/policy/${encodeURIComponent(decisionId)}/reject`,
      { method: "POST", requiresAuth: true },
    ),
};

export type ScenarioStep =
  | { type: "NAVIGATE"; path: string }
  | { type: "CLICK"; selector: string }
  | { type: "FILL"; selector: string; text: string }
  | { type: "WAIT_FOR_ELEMENT"; selector: string; timeoutMs: number }
  | { type: "ASSERT_URL"; path: string }
  | { type: "ASSERT_VISIBLE"; selector: string };
export interface CreateScenarioPayload {
  projectId: string;
  name: string;
  description?: string;
  steps: ScenarioStep[];
  isVerified?: boolean;
}
export interface ScenarioCatalogItem {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  steps: ScenarioStep[];
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface GenerateScenarioRequest {
  projectId: string;
  prompt: string;
}
export interface GenerateScenarioResponse {
  steps: ScenarioStep[];
  discoveryMapMissing: boolean;
  discoverySummary?: { routes: string[]; selectors: string[] };
}
export interface VerifyScenarioResponse {
  status: "queued" | "passed" | "failed";
  results: Array<{ index: number; status: "passed" | "failed"; error?: string }>;
  failedStepIndex: number | null;
  error: string | null;
  suggestedStep?: ScenarioStep;
  queued: boolean;
  jobId?: string;
}
export interface GenerateFromDiscoveryResponse {
  scanId: string | null;
  created: Array<{ id: string; name: string }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
  warnings: string[];
  discoveryMapMissing: boolean;
}
export const scenariosApi = {
  list: (projectId: string): Promise<ScenarioCatalogItem[]> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scenarios`, {
      requiresAuth: true,
      cache: "no-store",
    }),
  create: (projectId: string, payload: CreateScenarioPayload): Promise<ScenarioCatalogItem> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scenarios`, {
      method: "POST",
      body: JSON.stringify(payload),
      requiresAuth: true,
    }),
  generate: (
    projectId: string,
    payload: GenerateScenarioRequest,
  ): Promise<GenerateScenarioResponse> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scenarios/generate`, {
      method: "POST",
      body: JSON.stringify(payload),
      requiresAuth: true,
      timeoutMs: 120_000,
    }),
  generateFromDiscovery: (
    projectId: string,
    scanId: string,
  ): Promise<GenerateFromDiscoveryResponse> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scenarios/generate-from-discovery`, {
      method: "POST",
      body: JSON.stringify({ scanId }),
      requiresAuth: true,
      timeoutMs: 120_000,
    }),
  verify: (
    projectId: string,
    steps: ScenarioStep[],
    environmentId?: string,
  ): Promise<VerifyScenarioResponse> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/scenarios/verify`, {
      method: "POST",
      body: JSON.stringify({ projectId, steps, ...(environmentId ? { environmentId } : {}) }),
      requiresAuth: true,
      timeoutMs: 120_000,
    }),
  getVerification: (projectId: string, jobId: string): Promise<VerifyScenarioResponse> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/scenarios/verify/${encodeURIComponent(jobId)}`,
      {
        requiresAuth: true,
        cache: "no-store",
      },
    ),
  update: (
    projectId: string,
    scenarioId: string,
    payload: CreateScenarioPayload,
  ): Promise<ScenarioCatalogItem> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
        requiresAuth: true,
      },
    ),
  remove: (projectId: string, scenarioId: string): Promise<ScenarioCatalogItem> =>
    apiRequest(
      `/projects/${encodeURIComponent(projectId)}/scenarios/${encodeURIComponent(scenarioId)}`,
      {
        method: "DELETE",
        requiresAuth: true,
      },
    ),
};

export const projectsApi = {
  list: (organizationId: string, workspaceId?: string): Promise<Project[]> => {
    const params = new URLSearchParams({ organizationId });
    if (workspaceId) params.set("workspaceId", workspaceId);
    return apiRequest(`/projects?${params.toString()}`, { requiresAuth: true });
  },
  create: (data: CreateProjectRequest): Promise<Project> =>
    apiRequest("/projects", { method: "POST", body: JSON.stringify(data), requiresAuth: true }),
  remove: (projectId: string): Promise<Project> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      requiresAuth: true,
    }),
};

export type RunStatus =
  | "passed"
  | "passed_with_findings"
  | "partially_tested"
  | "blocked"
  | "failed"
  | "failed_preflight"
  | "running"
  | "queued";

export interface RunListItem {
  id: string;
  projectId: string;
  status: string;
  targetUrl: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  errorMessage?: string | null;
  hardErrorCount?: number;
  attemptCount?: number;
  metadata?: Record<string, unknown> | null;
}

export type RunMessageAuthorType = "USER" | "AGENT" | "SYSTEM";
export type RunMessageKind = "MESSAGE" | "CONTROL" | "APPROVAL" | "STATUS" | "SUMMARY";
export type RunConsoleControlAction =
  "PAUSE" | "RESUME" | "APPROVE" | "ALLOW_ACTION" | "ALLOW_SCENARIO" | "SKIP" | "STOP";

export interface RunMessage {
  id: string;
  runId: string;
  authorId?: string | null;
  authorType: RunMessageAuthorType;
  kind: RunMessageKind;
  action?: string | null;
  body: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export const runsApi = {
  list: (projectId: string): Promise<RunListItem[]> =>
    apiRequest(`/projects/${encodeURIComponent(projectId)}/runs`, { requiresAuth: true }),
  getReport: async (projectId: string, runId: string): Promise<RunReport> => {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedRunId = encodeURIComponent(runId);
    return apiRequest<RunReport>(`/projects/${encodedProjectId}/runs/${encodedRunId}/report`, {
      requiresAuth: true,
      cache: "no-store",
    });
  },
  getExecutionState: async (projectId: string, runId: string): Promise<RunExecutionState> => {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedRunId = encodeURIComponent(runId);
    return apiRequest<RunExecutionState>(
      `/projects/${encodedProjectId}/runs/${encodedRunId}/execution-state`,
      {
        requiresAuth: true,
        cache: "no-store",
      },
    );
  },
  getQaState: async (projectId: string, runId: string, limit = 200): Promise<QaLiveState> => {
    const encodedProjectId = encodeURIComponent(projectId);
    const encodedRunId = encodeURIComponent(runId);
    return apiRequest<QaLiveState>(
      `/projects/${encodedProjectId}/runs/${encodedRunId}/qa-state?limit=${Math.max(1, Math.min(500, Math.floor(limit)))}`,
      {
        requiresAuth: true,
        timeoutMs: 30_000,
      },
    );
  },
  listMessages: (projectId: string, runId: string): Promise<RunMessage[]> =>
    apiRequest<RunMessage[]>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/messages`,
      { requiresAuth: true },
    ),
  addMessage: (
    projectId: string,
    runId: string,
    body: string,
    metadata?: Record<string, unknown>,
  ): Promise<RunMessage> =>
    apiRequest<RunMessage>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ body, metadata }),
        requiresAuth: true,
      },
    ),
  control: (
    projectId: string,
    runId: string,
    action: RunConsoleControlAction,
    body?: string,
    metadata?: Record<string, unknown>,
  ): Promise<{
    action: RunConsoleControlAction;
    accepted: boolean;
    message?: RunMessage;
    terminalized?: boolean;
  }> =>
    apiRequest<{
      action: RunConsoleControlAction;
      accepted: boolean;
      message?: RunMessage;
      terminalized?: boolean;
    }>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/console/control`,
      {
        method: "POST",
        body: JSON.stringify({ action, body, metadata }),
        requiresAuth: true,
        timeoutMs: action === "STOP" ? 15_000 : 20_000,
      },
    ),
  continue: (
    projectId: string,
    runId: string,
    instruction?: string,
  ): Promise<{
    id: string;
    projectId: string;
    status: string;
    continuationOfRunId?: string | null;
    planId?: string | null;
  }> =>
    apiRequest<{
      id: string;
      projectId: string;
      status: string;
      continuationOfRunId?: string | null;
      planId?: string | null;
    }>(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/continue`, {
      method: "POST",
      body: JSON.stringify({
        instruction: instruction?.trim() || undefined,
        idempotencyKey: `console-continue-${runId}-${Date.now()}`,
      }),
      requiresAuth: true,
    }),
  deleteMessages: (projectId: string, runId: string): Promise<{ deleted: number }> =>
    apiRequest<{ deleted: number }>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/messages`,
      { method: "DELETE", requiresAuth: true },
    ),
  deleteRun: (
    projectId: string,
    runId: string,
  ): Promise<{
    runId: string;
    deleted: boolean;
    r2ObjectsDeleted: number;
    databaseRecordsDeleted: number;
    preservedCreditLedgerEntries: number;
  }> =>
    apiRequest<{
      runId: string;
      deleted: boolean;
      r2ObjectsDeleted: number;
      databaseRecordsDeleted: number;
      preservedCreditLedgerEntries: number;
    }>(`/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`, {
      method: "DELETE",
      requiresAuth: true,
      timeoutMs: 60_000,
    }),
  getHandoff: (projectId: string, runId: string): Promise<BrowserHandoff | null> =>
    apiRequest<BrowserHandoff | null>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/handoff`,
      { requiresAuth: true },
    ),
  claimHandoff: (projectId: string, runId: string): Promise<BrowserHandoff> =>
    apiRequest<BrowserHandoff>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/handoff/claim`,
      { method: "POST", requiresAuth: true, body: JSON.stringify({}) },
    ),
  completeHandoff: (
    projectId: string,
    runId: string,
    data: { email: string; password: string },
  ): Promise<BrowserHandoff> =>
    apiRequest<BrowserHandoff>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/handoff/complete`,
      { method: "POST", requiresAuth: true, body: JSON.stringify(data) },
    ),
  cancelHandoff: (projectId: string, runId: string): Promise<BrowserHandoff> =>
    apiRequest<BrowserHandoff>(
      `/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}/handoff/cancel`,
      { method: "POST", requiresAuth: true, body: JSON.stringify({}) },
    ),
};

export interface AllocationRequest {
  source: string;
  email: string;
  workload: string;
  submittedAt: string;
}
export const billingApi = {
  status: (): Promise<{
    organizationId: string;
    plan: PublicPlan;
    status: string;
    periodEnd?: string | null;
    whopPlanId?: string | null;
  }> => apiRequest("/billing/status", { requiresAuth: true, cache: "no-store" }),
  submitAllocationRequest: async (data: AllocationRequest): Promise<void> => {
    const webhookUrl = import.meta.env.VITE_ALLOCATION_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn("[Matrix QA] VITE_ALLOCATION_WEBHOOK_URL not set; skipping allocation request.");
      return;
    }
    return apiRequest<void>(webhookUrl, { method: "POST", body: JSON.stringify(data) });
  },
};
