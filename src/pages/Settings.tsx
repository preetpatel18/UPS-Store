import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { LogOut, Save, ShieldCheck } from "lucide-react";
import { Card, CardTitle } from "../components/Card";
import type { Role } from "../data/operations";
import { apiFetch, clearSession, getSession, saveSession, type SessionUser } from "../lib/api";
import { cn } from "../lib/utils";

type UserSession = {
  id: string;
  current: boolean;
  device: string;
  ip: string;
  lastSeenAt: string;
  createdAt: string;
  expiresAt: string;
};

type AuditLog = {
  _id: string;
  userName: string;
  action: string;
  createdAt: string;
};

type MeResponse = {
  user: SessionUser;
};

const preferenceLabels: Array<{ key: keyof NonNullable<SessionUser["notificationPreferences"]>; label: string; detail: string }> = [
  { key: "inApp", label: "In-app notifications", detail: "Keep alerts available on every signed-in browser." },
  { key: "messages", label: "Messages", detail: "Direct and group chat activity." },
  { key: "requests", label: "Credential requests", detail: "Password resets and staff account changes." },
  { key: "operations", label: "Store portfolio", detail: "Store status, payment, and configuration changes." },
  { key: "security", label: "Security", detail: "New sign-ins and session activity." }
];

const inputClass = "h-11 w-full rounded-2xl border bg-white/80 px-3 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring dark:bg-zinc-900/80";

export function Settings() {
  const navigate = useNavigate();
  const { role } = useOutletContext<{ role: Role }>();
  const canViewAudit = role === "Administrator" || role === "Owner";
  const [me, setMe] = useState<SessionUser | null>(getSession()?.user ?? null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [notice, setNotice] = useState("");
  const [profileDraft, setProfileDraft] = useState({ name: "", email: "" });
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", newPassword: "" });

  useEffect(() => {
    void loadSettings();
  }, [canViewAudit]);

  useEffect(() => {
    setProfileDraft({ name: me?.name ?? "", email: me?.email ?? "" });
  }, [me?.email, me?.name]);

  async function loadSettings() {
    try {
      const [profile, sessionRows] = await Promise.all([
        apiFetch<MeResponse>("/auth/me"),
        apiFetch<UserSession[]>("/auth/sessions")
      ]);
      setMe(profile.user);
      setSessions(sessionRows);
      const current = getSession();
      if (current) {
        saveSession({ ...current, user: profile.user });
      }
      if (canViewAudit) {
        setLogs(await apiFetch<AuditLog[]>("/audit-logs"));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load settings.");
    }
  }

  async function saveProfile() {
    try {
      const updated = await apiFetch<MeResponse>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify(profileDraft)
      });
      setMe(updated.user);
      const current = getSession();
      if (current) {
        saveSession({ ...current, user: updated.user });
      }
      setNotice("Profile updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update profile.");
    }
  }

  async function changePassword() {
    try {
      await apiFetch("/auth/password", {
        method: "PATCH",
        body: JSON.stringify(passwordDraft)
      });
      setPasswordDraft({ currentPassword: "", newPassword: "" });
      setNotice("Password changed. Use the new password next time you sign in.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not change password.");
    }
  }

  async function updatePreference(key: keyof NonNullable<SessionUser["notificationPreferences"]>, value: boolean) {
    try {
      const updated = await apiFetch<MeResponse>("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ [key]: value })
      });
      setMe(updated.user);
      const current = getSession();
      if (current) {
        saveSession({ ...current, user: updated.user });
      }
      setNotice("Notification settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update notifications.");
    }
  }

  async function revokeSession(id: string, current: boolean) {
    await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
    if (current) {
      clearSession();
      navigate("/auth", { replace: true });
      return;
    }
    setSessions((items) => items.filter((session) => session.id !== id));
    setNotice("Session revoked.");
  }

  function logout() {
    void apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    navigate("/auth", { replace: true });
  }

  const preferences = me?.notificationPreferences ?? {
    inApp: true,
    messages: true,
    requests: true,
    operations: true,
    security: true
  };

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      {notice ? <p className="rounded-2xl border bg-white/80 px-4 py-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/80 xl:col-span-2">{notice}</p> : null}

      <Card>
        <CardTitle title="Owner Profile" detail={role === "Owner" ? "Preet Patel platform owner account" : "Signed-in staff profile"} />
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primaryForeground shadow-soft">
            {initials(me?.name ?? "User")}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{me?.name}</p>
            <p className="truncate text-sm text-mutedForeground">{me?.username ? `@${me.username}` : me?.email}</p>
            <p className="mt-1 text-xs text-mutedForeground">{me?.storeName || "Platform"} · {me?.role}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <input className={inputClass} placeholder="Full name" value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} />
          <input className={inputClass} type="email" placeholder="Account email" value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft sm:col-span-2" onClick={() => void saveProfile()}>
            <Save className="h-4 w-4" />
            Save Profile
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle title="Change Password" detail="Passwords are hashed; old passwords cannot be viewed or recovered" />
        <div className="space-y-3">
          <input className={inputClass} type="password" placeholder="Current password" value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, currentPassword: event.target.value })} />
          <input className={inputClass} type="password" placeholder="New strong password" value={passwordDraft.newPassword} onChange={(event) => setPasswordDraft({ ...passwordDraft, newPassword: event.target.value })} />
          <button className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft" onClick={() => void changePassword()}>
            <ShieldCheck className="h-4 w-4" />
            Update Password
          </button>
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <CardTitle title="Notifications" detail="Stored in the backend so alerts follow you across devices" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {preferenceLabels.map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border bg-white/55 p-3 text-sm shadow-sm dark:bg-zinc-900/55">
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="mt-1 block text-xs text-mutedForeground">{item.detail}</span>
              </span>
              <button
                type="button"
                className={cn("h-8 shrink-0 rounded-xl border px-3 text-xs font-medium shadow-sm", preferences[item.key] ? "bg-primary text-primaryForeground" : "bg-white/80 dark:bg-zinc-900/80")}
                aria-pressed={preferences[item.key]}
                onClick={() => void updatePreference(item.key, !preferences[item.key])}
              >
                {preferences[item.key] ? "On" : "Off"}
              </button>
            </label>
          ))}
        </div>
      </Card>

      <Card className="xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Login Security" detail="Every browser gets its own server-validated session" />
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl border border-red-200 bg-white/80 px-3 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white/55 p-3 shadow-sm dark:bg-zinc-900/55">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{session.device}</p>
                  {session.current ? <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-mutedForeground">Current</span> : null}
                </div>
                <p className="mt-1 text-xs text-mutedForeground">IP {session.ip || "Unknown"} · Last seen {new Date(session.lastSeenAt).toLocaleString()}</p>
              </div>
              <button className="h-9 rounded-xl border border-red-200 bg-white/80 px-3 text-xs text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" onClick={() => void revokeSession(session.id, session.current)}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      </Card>

      {canViewAudit ? (
        <Card className="xl:col-span-2">
          <CardTitle title="Audit Logs" detail="Recent account and security activity" />
          <div className="thin-scrollbar max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {logs.map((log) => (
              <div key={log._id} className="rounded-2xl border bg-white/55 p-3 shadow-sm dark:bg-zinc-900/55">
                <p className="text-sm font-medium">{log.action}</p>
                <p className="mt-1 text-xs text-mutedForeground">{log.userName} · {new Date(log.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {!logs.length ? <p className="rounded-2xl border border-dashed p-5 text-center text-sm text-mutedForeground">No audit activity yet.</p> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}
