import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Bug,
  FlaskConical,
  FileText,
  Settings,
  ScrollText,
  Activity,
  Database,
  ChevronDown,
  ChevronUp,
  Bell,
  HelpCircle,
  Menu,
  X,
  MoreHorizontal,
  Check,
  Plus,
  Search,
  Cog,
  LogOut,
  KeyRound,
  UserCircle,
  Loader2,
  PlusCircle,
  CircleDollarSign,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo, MatrixMark } from "./logo";
import { useAuth } from "@/lib/auth-context";
import { organizationsApi, notificationsApi } from "@/lib/api-client";
import { useLivePortfolio } from "@/lib/live-data";
import { MiaGuide } from "./mia-guide";
import { DISCORD_SUPPORT_URL } from "@/lib/support";
import { OrganizationBalanceCard } from "./organization-balance-card";

type NavItem = { label: string; to: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { label: "Overview", to: "/app", icon: LayoutDashboard, exact: true },
  { label: "Projects", to: "/app/projects", icon: FolderKanban },
  { label: "Environments & data", to: "/app/environments", icon: Database },
  { label: "Discovery", to: "/app/discovery", icon: Search },
  { label: "Worker health", to: "/app/workforce", icon: Users },
  { label: "Test Runs", to: "/app/runs", icon: ListChecks },
  { label: "Scenarios", to: "/app/scenarios", icon: FlaskConical },
  { label: "Issues", to: "/app/issues", icon: Bug },
  { label: "Audit Log", to: "/app/audit", icon: ScrollText },
  { label: "Reports", to: "/app/reports", icon: FileText },
  { label: "Reliability", to: "/app/reliability", icon: Activity },
  { label: "Test capacity", to: "/app/credits", icon: CircleDollarSign },
  { label: "Notifications", to: "/app/notifications", icon: Bell },
  { label: "Settings", to: "/app/settings", icon: Settings },
];
const mobileTabs: NavItem[] = [
  { label: "Overview", to: "/app", icon: LayoutDashboard, exact: true },
  { label: "Projects", to: "/app/projects", icon: FolderKanban },
  { label: "Discovery", to: "/app/discovery", icon: Search },
  { label: "Runs", to: "/app/runs", icon: ListChecks },
];

function useIsActive() {
  const { pathname } = useLocation();
  return (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
}

export function AppShell({
  children,
  title = "Overview",
}: {
  children: ReactNode;
  title?: string;
}) {
  const isActive = useIsActive();
  const { isAuthenticated } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const result = await notificationsApi.unreadCount();
        if (mounted) setUnreadCount(result.unreadCount);
      } catch {
        if (mounted) setUnreadCount(0);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface/70 backdrop-blur md:flex">
        <SidebarBody isActive={isActive} />
      </aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <Logo />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarBody isActive={isActive} onNavigate={() => setDrawerOpen(false)} hideHeader />
          </aside>
        </div>
      )}
      <div className="flex min-h-screen flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MatrixMark size={22} />
            <span className="truncate font-display text-sm font-semibold">{title}</span>
          </div>
          <Link
            to="/app/notifications"
            aria-label="Notifications"
            className="relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </Link>
        </header>
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
          <ul className="grid grid-cols-5">
            {mobileTabs.map((t) => {
              const Icon = t.icon;
              const active = isActive(t);
              return (
                <li key={t.label}>
                  <Link
                    to={t.to}
                    className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
            <li>
              <button
                onClick={() => setDrawerOpen(true)}
                className="flex w-full flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground"
              >
                <MoreHorizontal className="h-[18px] w-[18px]" />
                More
              </button>
            </li>
          </ul>
        </nav>
        <MiaGuide />
      </div>
    </div>
  );
}

function SidebarBody({
  isActive,
  onNavigate,
  hideHeader,
}: {
  isActive: (item: NavItem) => boolean;
  onNavigate?: () => void;
  hideHeader?: boolean;
}) {
  const { user } = useAuth();
  return (
    <>
      {!hideHeader && (
        <div className="flex h-14 items-center border-b border-border px-4">
          <Logo />
        </div>
      )}
      <div className="px-3 pb-3 pt-4">
        <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Organization
        </p>
        <WorkspaceSwitcher />
        <OrganizationBalanceCard instanceId={hideHeader ? "mobile" : "desktop"} />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {nav.map((item) => (
          <SidebarNavLink
            key={item.label}
            item={item}
            active={isActive(item)}
            onNavigate={onNavigate}
          />
        ))}
        {user?.isStaff && (
          <SidebarNavLink
            item={{ label: "Admin", to: "/admin", icon: ShieldCheck }}
            active={isActive({ label: "Admin", to: "/admin", icon: ShieldCheck })}
            onNavigate={onNavigate}
          />
        )}
      </nav>
      <div className="border-t border-border p-3">
        <UserMenu onNavigate={onNavigate} />
      </div>
    </>
  );
}

function SidebarNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (item.label !== "Notifications" || !isAuthenticated) return;
    let mounted = true;
    const load = async () => {
      try {
        const result = await notificationsApi.unreadCount();
        if (mounted) setUnreadCount(result.unreadCount);
      } catch {
        /* the notification center will show the actionable error */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [item.label, isAuthenticated]);

  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
    >
      {active && <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-primary" />}
      <Icon className="h-4 w-4" />
      <span className="flex-1">{item.label}</span>
      {item.label === "Notifications" && unreadCount > 0 && (
        <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-primary-foreground">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

function useClickAway<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);
  return ref;
}

function WorkspaceSwitcher() {
  const { user } = useAuth();
  const live = useLivePortfolio();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useClickAway<HTMLDivElement>(open, () => setOpen(false));
  const activeOrganization = live.activeOrganization;
  const activeWorkspace = live.activeWorkspace;
  const activeProject = live.activeProject;
  const ownsOrganization = live.organizations.some((organization) => organization.ownerId === user?.id);
  const filteredOrganizations = live.organizations.filter((organization) => organization.name.toLowerCase().includes(q.toLowerCase()));

  const createOrganization = async (event: React.FormEvent) => {
    event.preventDefault();
    if (ownsOrganization) {
      setError("The current account can use its existing organization only.");
      setShowCreate(false);
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const organization = await organizationsApi.create({ name: trimmed });
      localStorage.setItem("matrix_qa_active_organization", organization.id);
      localStorage.removeItem("matrix_qa_active_workspace");
      localStorage.removeItem("matrix_qa_active_project");
      live.refresh();
      setName("");
      setShowCreate(false);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create organization.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full min-w-0 items-center justify-between rounded-md border border-border bg-surface-2/60 px-3 py-2 text-left text-sm transition-colors hover:bg-accent">
        <span className="min-w-0">
          <span className="block truncate text-sm">{activeOrganization?.name ?? "Select organization"}</span>
          <span className="block truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{activeWorkspace?.name ?? "Select workspace"}{activeProject ? ` · ${activeProject.name}` : ""}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[min(80vh,30rem)] overflow-y-auto rounded-md border border-border bg-popover shadow-2xl">
          <div className="border-b border-border p-2"><div className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 px-2 py-1.5"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input autoFocus value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search organizations…" className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground" /></div></div>
          <div className="px-3 pt-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Organizations</div>
          <ul className="p-1">{filteredOrganizations.map((organization) => <li key={organization.id}><button onClick={() => { live.setActiveOrganization(organization.id); setOpen(false); }} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${organization.id === activeOrganization?.id ? "bg-primary/10 text-foreground" : "hover:bg-accent"}`}><span className="min-w-0 flex-1 truncate">{organization.name}</span>{organization.id === activeOrganization?.id && <Check className="h-3.5 w-3.5 text-primary" />}</button></li>)}</ul>
          <div className="border-t border-border px-3 pt-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Workspaces</div>
          <ul className="p-1">{live.workspaces.map((workspace) => <li key={workspace.id}><button onClick={() => { live.setActiveWorkspace(workspace.id); setOpen(false); }} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${workspace.id === activeWorkspace?.id ? "bg-primary/10 text-foreground" : "hover:bg-accent"}`}><span className="min-w-0 flex-1 truncate">{workspace.name}</span>{workspace.id === activeWorkspace?.id && <Check className="h-3.5 w-3.5 text-primary" />}</button></li>)}{live.workspaces.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Loading workspaces…</li>}</ul>
          <div className="border-t border-border px-3 pt-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Projects</div>
          <ul className="p-1">{live.projects.map((project) => <li key={project.id}><button onClick={() => { live.setActiveProject(project.id); setOpen(false); }} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm ${project.id === activeProject?.id ? "bg-primary/10 text-foreground" : "hover:bg-accent"}`}><span className="min-w-0 flex-1 truncate">{project.name}</span>{project.id === activeProject?.id && <Check className="h-3.5 w-3.5 text-primary" />}</button></li>)}{live.projects.length === 0 && <li className="px-2 py-2 text-xs text-muted-foreground">Loading projects…</li>}</ul>
          {error && <p className="border-t border-border px-3 py-2 text-[11px] text-destructive">{error}</p>}
          <div className="border-t border-border p-1">{!showCreate ? <button onClick={() => { setShowCreate(true); setError(null); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs text-primary hover:bg-accent"><PlusCircle className="h-3.5 w-3.5" /> Create new organization</button> : <form onSubmit={createOrganization} className="p-2"><label className="mb-1.5 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Organization name</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme QA Organization" maxLength={80} className="mb-2 w-full rounded-md border border-border bg-surface-2 px-2.5 py-2 text-sm outline-none focus:border-primary" /><div className="flex gap-2"><button type="button" onClick={() => setShowCreate(false)} className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">Cancel</button><button type="submit" disabled={creating || !name.trim()} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Create</button></div></form>}<Link to="/app/settings/organization" onClick={() => setOpen(false)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"><Cog className="h-3.5 w-3.5" /> Organization & workspaces</Link></div>
        </div>
      )}
    </div>
  );
}

function PersonalAvatar({
  user,
  className = "h-9 w-9",
  textClassName = "text-[11px]",
}: {
  user: ReturnType<typeof useAuth>["user"];
  className?: string;
  textClassName?: string;
}) {
  const initials = (user?.fullName || user?.email || "MQ")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt="Profile avatar"
      className={`${className} shrink-0 rounded-full object-cover`}
    />
  ) : (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/70 to-primary/20 font-mono font-semibold text-primary-foreground ${textClassName}`}
    >
      {initials}
    </div>
  );
}

function UserMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickAway<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
      >
        <PersonalAvatar user={user} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">
            {user?.fullName || user?.email || "Matrix QA"}
          </div>
          <div className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Member
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-md border border-border bg-popover shadow-2xl">
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
          </div>
          <ul className="p-1 text-sm">
            <li>
              <Link
                to="/app/settings"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-accent"
              >
                <UserCircle className="h-4 w-4 text-muted-foreground" />
                Account settings
              </Link>
            </li>
            <li>
              <Link
                to="/app/settings"
                search={{ tab: "tokens" }}
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-accent"
              >
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                Workspace API keys
              </Link>
            </li>
            <li>
              <Link
                to="/app/settings/billing"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-accent"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Billing & usage
              </Link>
            </li>
            <li>
              <a
                href={DISCORD_SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded px-2 py-1.5 text-foreground hover:bg-accent"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
                Support on Discord
              </a>
            </li>
          </ul>
          <div className="border-t border-border p-1">
            <button
              onClick={() => {
                logout();
                setOpen(false);
                onNavigate?.();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-destructive hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
