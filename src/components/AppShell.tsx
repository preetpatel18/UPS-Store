import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Boxes,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  Mail,
  Moon,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Role } from "../data/operations";
import { apiFetch, clearSession, getSession } from "../lib/api";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, minRole: "Employee" as Role },
  { to: "/timesheets", label: "Timesheets", icon: Clock3, minRole: "Employee" as Role },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, minRole: "Employee" as Role },
  { to: "/problem-log", label: "Problem Log", icon: ClipboardList, minRole: "Employee" as Role },
  { to: "/print-jobs", label: "Print Jobs", icon: PackageCheck, minRole: "Employee" as Role },
  { to: "/messages", label: "Messages", icon: Mail, minRole: "Employee" as Role },
  { to: "/requests-off", label: "Requests Off", icon: FileText, minRole: "Employee" as Role },
  { to: "/inventory", label: "Inventory", icon: Boxes, minRole: "Employee" as Role },
  { to: "/management", label: "Management", icon: BarChart3, minRole: "Manager" as Role },
  { to: "/settings", label: "Settings", icon: Settings, minRole: "Employee" as Role }
];

const ownerNavItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, minRole: "Owner" as Role },
  { to: "/messages", label: "Messages", icon: Mail, minRole: "Owner" as Role },
  { to: "/management", label: "Management", icon: BarChart3, minRole: "Owner" as Role },
  { to: "/settings", label: "Settings", icon: Settings, minRole: "Owner" as Role }
];

const roleDescriptions: Record<Role, string> = {
  Employee: "Staff workspace",
  Manager: "Operations management",
  Administrator: "Store administration",
  Owner: "Platform owner"
};

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/timesheets": "Timesheets",
  "/calendar": "Calendar",
  "/problem-log": "Problem Log",
  "/inventory": "Inventory",
  "/print-jobs": "Print Jobs",
  "/messages": "Messages",
  "/requests-off": "Requests Off",
  "/management": "Management",
  "/management/problem-log": "Management · Problem Log",
  "/management/print-job-log": "Management · Print Job Log",
  "/management/staff": "Management · Staff",
  "/settings": "Settings"
};

type SearchResult = {
  id: string;
  title: string;
  detail: string;
  type: string;
  link: string;
};

type PortalNotification = {
  _id: string;
  title: string;
  body: string;
  type: "Info" | "Request" | "Message" | "Alert";
  link: string;
  read: boolean;
  createdAt: string;
};

export function AppShell() {
  const navigate = useNavigate();
  const session = getSession();
  const role = session?.user?.role ?? "Employee";
  const visibleNavItems = useMemo(() => role === "Owner" ? ownerNavItems : navItems.filter((item) => canAccess(role, item.minRole)), [role]);
  const [dark, setDark] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();
  const query = search.trim().toLowerCase();
  const pageResults = query
    ? visibleNavItems
      .filter((item) => item.label.toLowerCase().includes(query))
      .map((item) => ({ id: `page-${item.to}`, title: item.label, detail: "Portal page", type: "Page", link: item.to }))
    : [];
  const combinedSearchResults = [...pageResults, ...searchResults].filter((result, index, results) =>
    results.findIndex((item) => item.id === result.id && item.type === result.type) === index
  );
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    setSearch("");
    setSearchOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (role !== "Owner") return;
    const allowed = location.pathname === "/" || location.pathname.startsWith("/messages") || location.pathname.startsWith("/management") || location.pathname.startsWith("/settings");
    if (!allowed) {
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate, role]);

  useEffect(() => {
    if (query.length < 2 || role === "Owner") {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      void apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, role]);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => void loadNotifications(), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function logout() {
    void apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    navigate("/auth", { replace: true });
  }

  async function loadNotifications() {
    try {
      setNotifications(await apiFetch<PortalNotification[]>("/notifications"));
    } catch {
      setNotifications([]);
    }
  }

  function chooseSearchResult(result: SearchResult) {
    setSearch("");
    setSearchOpen(false);
    navigate(result.link);
  }

  async function openNotification(notification: PortalNotification) {
    if (!notification.read) {
      try {
        const updated = await apiFetch<PortalNotification>(`/notifications/${notification._id}/read`, { method: "PATCH" });
        setNotifications((current) => current.map((item) => item._id === updated._id ? updated : item));
      } catch {
        return;
      }
    }
    setNotificationsOpen(false);
    navigate(notification.link);
  }

  async function markAllNotificationsRead() {
    await apiFetch("/notifications/read-all", { method: "PATCH" });
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }

  return (
    <div className="min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/70 bg-white/75 shadow-soft backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/75 lg:block">
        <div className="flex h-16 items-center border-b border-white/70 px-5 dark:border-white/10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primaryForeground shadow-soft">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-semibold">StoreOps Portal</p>
            <p className="text-xs text-mutedForeground">{roleDescriptions[role]}</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-mutedForeground transition hover:bg-white hover:text-foreground hover:shadow-soft dark:hover:bg-white/10",
                  isActive && "bg-primary text-primaryForeground shadow-soft hover:bg-primary hover:text-primaryForeground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/70 bg-white/78 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/78">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-mutedForeground">{role}</p>
              <h1 className="text-xl font-semibold">{pageTitles[location.pathname] ?? "Operations"}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1 md:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedForeground" />
                <input
                  className="h-10 w-full rounded-xl border border-white/70 bg-white/80 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-zinc-900/80"
                  placeholder={role === "Owner" ? "Search portfolio" : "Search operations"}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && combinedSearchResults[0]) {
                      chooseSearchResult(combinedSearchResults[0]);
                    }
                    if (event.key === "Escape") {
                      setSearchOpen(false);
                    }
                  }}
                />
                {searchOpen && query ? (
                  <div className="absolute right-0 top-12 z-50 max-h-96 w-full min-w-[19rem] overflow-y-auto rounded-xl border bg-white p-2 shadow-soft dark:bg-zinc-900">
                    {combinedSearchResults.map((result) => (
                      <button key={`${result.type}-${result.id}`} type="button" className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left shadow-none hover:bg-accent" onClick={() => chooseSearchResult(result)}>
                        <Search className="mt-0.5 h-4 w-4 shrink-0 text-mutedForeground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{result.title}</span>
                          <span className="block truncate text-xs text-mutedForeground">{result.type} · {result.detail}</span>
                        </span>
                      </button>
                    ))}
                    {!combinedSearchResults.length ? (
                      <p className="px-3 py-4 text-center text-xs text-mutedForeground">{searchLoading ? "Searching..." : "No matching operations found."}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="relative">
                <button
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/80 shadow-sm dark:border-white/10 dark:bg-zinc-900/80"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                  onClick={() => setNotificationsOpen((current) => !current)}
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifications ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-zinc-900" /> : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-white p-2 shadow-soft dark:bg-zinc-900">
                    <div className="flex items-center justify-between gap-3 border-b px-2 pb-2">
                      <div>
                        <p className="text-sm font-semibold">Notifications</p>
                        <p className="text-xs text-mutedForeground">{unreadNotifications} unread</p>
                      </div>
                      {unreadNotifications ? (
                        <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs shadow-none hover:bg-accent" onClick={() => void markAllNotificationsRead()}>
                          <CheckCheck className="h-3.5 w-3.5" />
                          Mark all read
                        </button>
                      ) : null}
                    </div>
                    <div className="thin-scrollbar max-h-80 overflow-y-auto pt-1">
                      {notifications.map((notification) => (
                        <button key={notification._id} type="button" className={cn("flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left shadow-none hover:bg-accent", !notification.read && "bg-accent/60")} onClick={() => void openNotification(notification)}>
                          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", notification.read ? "bg-muted" : "bg-foreground")} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{notification.title}</span>
                            <span className="mt-0.5 block text-xs text-mutedForeground">{notification.body}</span>
                            <span className="mt-1 block text-[11px] text-mutedForeground">{relativeTime(notification.createdAt)}</span>
                          </span>
                        </button>
                      ))}
                      {!notifications.length ? <p className="px-3 py-8 text-center text-xs text-mutedForeground">You are all caught up.</p> : null}
                    </div>
                  </div>
                ) : null}
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/80 shadow-sm dark:border-white/10 dark:bg-zinc-900/80" onClick={() => setDark((value) => !value)} aria-label="Toggle dark mode">
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button className="flex h-10 items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-900/80" aria-label="User profile" onClick={logout}>
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-[10px] font-semibold text-primaryForeground">
                  {initials(session?.user?.name ?? "User")}
                </span>
                <span className="hidden max-w-28 truncate md:inline">{session?.user?.name ?? "Logout"}</span>
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-white/70 px-3 py-2 dark:border-white/10 lg:hidden">
            {visibleNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => cn("flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs", isActive ? "bg-primary text-primaryForeground" : "text-mutedForeground")}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 lg:p-6">
          <Outlet context={{ role }} />
        </main>
      </div>
    </div>
  );
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

export function RoleGate({ role, min, children }: { role: Role; min: Role; children: React.ReactNode }) {
  return canAccess(role, min) ? children : null;
}

export function canAccess(role: Role, min: Role) {
  const order = { Employee: 0, Manager: 1, Administrator: 2, Owner: 3 };
  return order[role] >= order[min];
}
