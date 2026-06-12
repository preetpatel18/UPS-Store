import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  ClipboardList,
  Clock3,
  Database,
  Eye,
  EyeOff,
  FileDown,
  LockKeyhole,
  Mail,
  Menu,
  MessageSquare,
  Package,
  Printer,
  Search,
  Settings,
  Store,
  UserCircle,
  Users,
  X
} from "lucide-react";
import { apiFetch, saveSession, type Session } from "../lib/api";

type AuthMode = "signin" | "forgot" | "reset";
type Icon = typeof Store;

const stats = [
  { value: "3", label: "Store Roles" },
  { value: "12+", label: "Core Modules" },
  { value: "100%", label: "Secure Access" },
  { value: "24/7", label: "Web Access" }
];

const platformCards: Array<{ icon: Icon; role: string; title: string; description: string; tags: string[] }> = [
  {
    icon: Store,
    role: "ADMIN",
    title: "Store Administrator",
    description: "Control the store account structure, create managers and employees, reset passwords, and review key operational records.",
    tags: ["Users", "Security", "Audit Trail", "Reports"]
  },
  {
    icon: ClipboardList,
    role: "MANAGER",
    title: "Store Manager",
    description: "Run the daily floor: schedules, time reviews, problem logs, print jobs, inventory categories, and staff coordination.",
    tags: ["Schedule", "Timesheets", "Inventory", "Issues"]
  },
  {
    icon: UserCircle,
    role: "EMPLOYEE",
    title: "Team Member",
    description: "Work from a focused employee view with clock activity, calendar, availability, messaging, print jobs, and inventory updates.",
    tags: ["Clock", "Calendar", "Messages", "Jobs"]
  }
];

const modules: Array<{ icon: Icon; title: string }> = [
  { icon: Clock3, title: "Timesheets & Clock Tracking" },
  { icon: FileDown, title: "Payroll Export" },
  { icon: CalendarDays, title: "Schedule Calendar" },
  { icon: MessageSquare, title: "Internal Messaging" },
  { icon: Users, title: "Staff Management" },
  { icon: AlertTriangle, title: "Problem Log" },
  { icon: Printer, title: "Print Jobs" },
  { icon: Package, title: "Inventory Management" },
  { icon: Bell, title: "Notifications" },
  { icon: Search, title: "Global Search" },
  { icon: Settings, title: "Settings" },
  { icon: Database, title: "Store Data Separation" }
];

const steps = [
  {
    number: "01",
    title: "Store is created",
    description: "Preet provisions the UPS Store record and connects the store to its own data environment."
  },
  {
    number: "02",
    title: "Accounts are provisioned",
    description: "Authorized leadership creates administrator, manager, and employee accounts. Public self-signup is disabled."
  },
  {
    number: "03",
    title: "Daily operations begin",
    description: "Employees and managers handle time, schedules, print jobs, inventory, messages, and issue tracking."
  },
  {
    number: "04",
    title: "Management reviews",
    description: "Leadership reviews history, exports payroll data, manages staff, and keeps the store organized."
  }
];

const capabilities = ["Role-Based Access", "Multi-Store Structure", "Notifications", "CSV Export", "Dark / Light Mode", "Mobile Responsive", "Audit Logging", "MongoDB Backend"];

export function Auth() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "info">("error");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [resetToken, setResetToken] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [isAccessOpen, setIsAccessOpen] = useState(false);
  const [highlightContact, setHighlightContact] = useState(false);
  const [form, setForm] = useState({
    identifier: "",
    password: ""
  });

  function setAlert(text: string, tone: "error" | "info" = "error") {
    setMessage(text);
    setMessageTone(tone);
  }

  function openAccess(mode: AuthMode = "signin") {
    setAuthMode(mode);
    setMessage("");
    setIsAccessOpen(true);
  }

  function closeAccess() {
    setIsAccessOpen(false);
    setShowPassword(false);
  }

  function showAccountContact() {
    setIsAccessOpen(false);
    setHighlightContact(true);
    window.setTimeout(() => {
      document.getElementById("access-info")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
    window.setTimeout(() => setHighlightContact(false), 3200);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.identifier || !form.password) {
      setAlert("Complete the required fields to continue.");
      return;
    }

    try {
      const session = await apiFetch<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: form.identifier, password: form.password })
      });

      saveSession(session);
      navigate("/", { replace: true });
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "Unable to reach the backend. Check MongoDB setup and API server.");
    }
  }

  async function requestPasswordReset() {
    setMessage("");
    if (!form.identifier.trim()) {
      setAlert("Enter your username or email first.");
      return;
    }
    try {
      const response = await apiFetch<{ message: string; resetToken?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier: form.identifier })
      });
      setResetToken(response.resetToken ?? "");
      setAuthMode("reset");
      setAlert(response.resetToken ? `Reset token created: ${response.resetToken}` : response.message, "info");
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "Could not start password reset.");
    }
  }

  async function completePasswordReset() {
    setMessage("");
    if (!resetToken.trim() || !resetPassword.trim()) {
      setAlert("Enter the reset token and new password.");
      return;
    }
    try {
      const response = await apiFetch<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password: resetPassword })
      });
      setAuthMode("signin");
      setForm({ ...form, password: "" });
      setResetPassword("");
      setResetToken("");
      setAlert(response.message, "info");
    } catch (error) {
      setAlert(error instanceof Error ? error.message : "Could not reset password.");
    }
  }

  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <nav className="fixed inset-x-0 top-0 z-40 flex h-[62px] items-center justify-between border-b border-white/10 bg-[#080808]/95 px-4 backdrop-blur-xl sm:px-8 lg:px-[6%]">
        <a className="flex items-center gap-3 shadow-none" href="#top" aria-label="StoreOps home">
          <span className="flex h-8 w-8 items-center justify-center bg-white text-[10px] font-bold tracking-tight text-black">SO</span>
          <span className="font-semibold tracking-tight">StoreOps <span className="font-normal text-zinc-500">/ Internal</span></span>
          <span className="hidden bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:inline-flex">v2.0</span>
        </a>
        <div className="hidden items-center gap-7 text-sm text-zinc-500 md:flex">
          <a className="shadow-none hover:text-white" href="#platform">Platform</a>
          <a className="shadow-none hover:text-white" href="#modules">Modules</a>
          <a className="shadow-none hover:text-white" href="#access-info">Access</a>
        </div>
        <div className="flex items-center gap-2">
          <button className="hidden bg-white px-5 py-2 text-sm font-semibold text-black shadow-none hover:bg-zinc-200 sm:inline-flex" onClick={() => openAccess()}>
            Sign In
          </button>
          <button className="flex h-10 w-10 items-center justify-center border border-white/10 text-white shadow-none md:hidden" aria-label="Open access menu" onClick={() => openAccess()}>
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </nav>

      <section id="top" className="grid min-h-screen pt-[62px] lg:grid-cols-2">
        <div className="relative flex min-h-[calc(100vh-62px)] flex-col justify-center overflow-hidden border-b border-white/10 px-6 py-16 sm:px-10 lg:border-b-0 lg:border-r lg:px-[10%]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:52px_52px] opacity-25" />
          <div className="relative z-10">
            <p className="mb-8 inline-flex items-center gap-2 border border-white/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Internal Operations Platform
            </p>
            <h1 className="max-w-3xl text-[clamp(3rem,6vw,5.6rem)] font-bold leading-[0.92] tracking-[-0.05em]">
              Run your
              <span className="block text-transparent [-webkit-text-stroke:1px_white]">stores.</span>
              Your way.
            </h1>
            <p className="mt-7 max-w-md text-sm leading-7 text-zinc-500 sm:text-base">
              A single secure portal for UPS Store-style administrators, managers, and employees to manage timesheets, scheduling, inventory, print jobs, messaging, and daily issues.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <button className="bg-white px-7 py-3 text-sm font-semibold text-black shadow-none hover:-translate-y-0.5 hover:bg-zinc-200" onClick={() => openAccess()}>
                Sign In to Your Portal
              </button>
              <a className="border border-white/10 px-7 py-3 text-sm font-medium text-white shadow-none hover:border-white hover:bg-white/5" href="#platform">
                See What&apos;s Inside
              </a>
            </div>
          </div>
        </div>

        <div id="access-info" className="flex flex-col justify-center bg-[#111] px-6 py-14 sm:px-10 lg:px-[8%]">
          <div className="rounded-[2rem] border border-white/10 bg-[#080808] p-7 shadow-2xl shadow-black/35 sm:p-9">
            <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Portal Access</p>
            <LockKeyhole className="mb-7 h-12 w-12 text-white" />
            <h2 className="text-4xl font-bold tracking-[-0.04em]">Authorized users only.</h2>
            <p className="mt-5 text-sm leading-7 text-zinc-500">
              If your account already exists, sign in with the username or email assigned to you.
            </p>
            <button className="mt-8 inline-flex items-center gap-2 bg-white px-7 py-3 text-sm font-semibold text-black shadow-none hover:bg-zinc-200" onClick={() => openAccess()}>
              Sign In
              <ArrowRight className="h-4 w-4" />
            </button>

            <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/20">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">Need an account?</p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Contact Preet Patel directly and include your store name, role, and the access you need.
              </p>
              <a className={`mt-4 inline-flex w-full items-center justify-center gap-2 bg-white px-4 py-3 text-sm font-semibold text-black shadow-none hover:bg-zinc-200 sm:w-auto ${highlightContact ? "animate-pulse ring-4 ring-white/70 shadow-[0_0_40px_rgba(255,255,255,0.45)]" : ""}`} href="mailto:preetpatel1862@gmail.com">
                <Mail className="h-4 w-4" />
                preetpatel1862@gmail.com
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4f0] px-6 py-10 text-black sm:px-10 lg:px-[10%]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[1.5rem] border border-zinc-200 bg-white px-4 py-8 text-center shadow-soft">
              <p className="text-4xl font-bold tracking-[-0.05em]">{stat.value}</p>
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="platform" className="bg-[#f4f4f0] px-6 py-20 text-black sm:px-10 lg:px-[10%]">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">Platform Overview</p>
            <h2 className="max-w-lg text-[clamp(2.4rem,4vw,4rem)] font-bold leading-[0.96] tracking-[-0.05em]">
              Clean access for each store role.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-zinc-600">
              The front page should be simple: sign in if your account exists, or contact Preet if you need one. Inside the portal, each role gets the tools it actually needs.
            </p>
            <button className="mt-7 inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-zinc-800" type="button" onClick={showAccountContact}>
              <Mail className="h-4 w-4" />
              Request access
            </button>
          </div>

          <div className="grid gap-4">
            {platformCards.map((card) => (
              <article key={card.title} className="group rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-zinc-300 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
                    <card.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{card.role}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-zinc-950">{card.title}</h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">{card.description}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {card.tags.map((tag) => (
                        <span key={`${card.title}-${tag}`} className="rounded-full bg-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="modules" className="bg-[#101010] px-6 py-20 sm:px-10 lg:px-[10%]">
        <SectionHeading eyebrow="Portal Modules" title={<>Included<br />features.</>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((module) => (
            <article key={module.title} className="flex items-center gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.07]">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30">
                <module.icon className="h-5 w-5 text-white" />
              </span>
              <h3 className="text-base font-semibold tracking-tight">{module.title}</h3>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#f4f4f0] px-6 py-20 text-black sm:px-10 lg:px-[10%]">
        <SectionHeading dark eyebrow="Getting Started" title={<>Up and running<br />in four steps.</>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <article key={step.number} className="rounded-[1.5rem] border border-zinc-200 bg-white p-7 shadow-soft">
              <p className="mb-5 text-4xl font-bold tracking-[-0.05em] text-zinc-200">{step.number}</p>
              <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-xs leading-6 text-zinc-600">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#080808] px-6 py-10 sm:px-10 lg:px-[10%]">
        <div className="flex flex-wrap items-center justify-between gap-5 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/25 sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Platform capabilities</p>
          <div className="flex flex-wrap gap-2">
            {capabilities.map((capability) => (
              <span key={capability} className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-medium text-zinc-400">
                {capability}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f4f4f0] px-6 py-16 text-black sm:px-10 lg:px-[10%]">
        <div className="grid items-center gap-8 rounded-[2rem] border border-zinc-200 bg-white p-7 shadow-soft sm:p-10 lg:grid-cols-[1fr_auto]">
          <div>
            <h2 className="text-4xl font-bold leading-tight tracking-[-0.04em]">Ready to streamline<br />store operations?</h2>
            <p className="mt-3 max-w-lg text-sm leading-7 text-zinc-600">
              Sign in if your account is already active. If you need access, contact Preet directly.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-full bg-black px-7 py-3 text-sm font-semibold text-white shadow-soft hover:bg-zinc-800" onClick={() => openAccess()}>
              Sign In Now
            </button>
            <button className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-7 py-3 text-sm font-semibold text-black shadow-none hover:border-black" type="button" onClick={showAccountContact}>
              <Mail className="h-4 w-4" />
              Request Account
            </button>
          </div>
        </div>
      </section>

      <footer className="bg-[#080808] px-6 py-12 sm:px-10 lg:px-[10%]">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/25 sm:p-8">
        <div className="grid gap-10 border-b border-white/10 pb-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center bg-white text-[10px] font-bold text-black">SO</span>
              <span className="font-semibold tracking-tight">StoreOps <span className="font-normal text-zinc-600">/ Internal</span></span>
            </div>
            <p className="mt-4 max-w-xs text-xs leading-6 text-zinc-600">
              Internal operations platform for UPS Store-style administrators, managers, and employees.
            </p>
          </div>
          <FooterColumn title="Operations" links={["Timesheets", "Scheduling", "Print Jobs", "Inventory"]} openAccess={openAccess} />
          <FooterColumn title="Management" links={["Staff Directory", "Problem Log", "Audit Logs", "Settings"]} openAccess={openAccess} />
          <FooterColumn title="Account" links={["Sign In", "Password Reset", "Security"]} openAccess={openAccess} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-6 text-xs text-zinc-600">
          <p>© 2026 StoreOps Portal. Authorized access only.</p>
          <p>Built for secure internal operations.</p>
        </div>
        </div>
      </footer>

      {isAccessOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Portal access">
          <div className="relative w-full max-w-[440px] border border-white/10 bg-[#080808] p-7 text-white shadow-2xl sm:p-10">
            <button className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center text-zinc-500 shadow-none hover:text-white" type="button" onClick={closeAccess} aria-label="Close sign in">
              <X className="h-5 w-5" />
            </button>

            <div className="mb-8 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center bg-white text-[10px] font-bold text-black">SO</span>
              <span className="font-semibold tracking-tight">StoreOps Portal</span>
            </div>

            <h2 className="text-2xl font-bold tracking-tight">{authMode === "signin" ? "Welcome back" : authMode === "forgot" ? "Recover access" : "Reset password"}</h2>
            <p className="mt-2 text-sm text-zinc-500">
              {authMode === "signin"
                ? "Sign in to your store operations account."
                : authMode === "forgot"
                  ? "Enter your username or email to request recovery."
                  : "Paste your reset token and create a new password."}
            </p>

            {authMode === "signin" ? (
              <form className="mt-8 space-y-5" onSubmit={submit}>
                <DarkUsernameField value={form.identifier} onChange={(identifier) => setForm({ ...form, identifier })} />
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Password</span>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      className="h-12 w-full border border-white/10 bg-[#111] pl-10 pr-11 text-sm text-white outline-none focus:border-white"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) => setForm({ ...form, password: event.target.value })}
                      placeholder="Enter password"
                    />
                    <button className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center text-zinc-500 shadow-none hover:text-white" type="button" onClick={() => setShowPassword((value) => !value)} aria-label="Toggle password visibility">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </label>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-600">Managed accounts only.</p>
                  <button className="border-b border-white/10 text-xs text-zinc-500 shadow-none hover:text-white" type="button" onClick={() => { setMessage(""); setAuthMode("forgot"); }}>
                    Forgot password?
                  </button>
                </div>
                <button className="flex w-full items-center justify-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-3 text-center text-xs font-semibold text-zinc-200 shadow-none hover:border-white/40" type="button" onClick={showAccountContact}>
                  <Mail className="h-4 w-4" />
                  Need an account? Contact preetpatel1862@gmail.com
                </button>
                <Alert message={message} tone={messageTone} />
                <button className="w-full bg-white py-3 text-sm font-semibold text-black shadow-none hover:bg-zinc-200" type="submit">
                  Sign In to Portal
                </button>
              </form>
            ) : null}

            {authMode === "forgot" ? (
              <div className="mt-8 space-y-5">
                <DarkUsernameField value={form.identifier} onChange={(identifier) => setForm({ ...form, identifier })} />
                <Alert message={message} tone={messageTone} />
                <button className="w-full bg-white py-3 text-sm font-semibold text-black shadow-none hover:bg-zinc-200" type="button" onClick={() => void requestPasswordReset()}>
                  Request Reset
                </button>
                <button className="w-full border border-white/10 py-3 text-sm text-zinc-400 shadow-none hover:border-white hover:text-white" type="button" onClick={() => { setMessage(""); setAuthMode("signin"); }}>
                  Back to sign in
                </button>
              </div>
            ) : null}

            {authMode === "reset" ? (
              <div className="mt-8 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Reset Token</span>
                  <input className="h-12 w-full border border-white/10 bg-[#111] px-3 text-sm text-white outline-none focus:border-white" value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Paste reset token" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">New Password</span>
                  <input className="h-12 w-full border border-white/10 bg-[#111] px-3 text-sm text-white outline-none focus:border-white" type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} placeholder="New strong password" />
                </label>
                <Alert message={message} tone={messageTone} />
                <button className="w-full bg-white py-3 text-sm font-semibold text-black shadow-none hover:bg-zinc-200" type="button" onClick={() => void completePasswordReset()}>
                  Reset Password
                </button>
                <button className="w-full border border-white/10 py-3 text-sm text-zinc-400 shadow-none hover:border-white hover:text-white" type="button" onClick={() => { setMessage(""); setAuthMode("signin"); }}>
                  Back to sign in
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function SectionHeading({ eyebrow, title, dark = false }: { eyebrow: string; title: React.ReactNode; dark?: boolean }) {
  return (
    <div className="mb-12">
      <p className={`mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] ${dark ? "text-zinc-500" : "text-zinc-600"}`}>{eyebrow}</p>
      <h2 className={`text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[0.95] tracking-[-0.05em] ${dark ? "text-black" : "text-white"}`}>
        {title}
      </h2>
    </div>
  );
}

function FooterColumn({ title, links, openAccess }: { title: string; links: string[]; openAccess: (mode?: AuthMode) => void }) {
  return (
    <div>
      <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((link) => (
          <li key={link}>
            <button className="text-left text-xs text-zinc-500 shadow-none hover:text-white" type="button" onClick={() => openAccess(link === "Password Reset" ? "forgot" : "signin")}>
              {link}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DarkUsernameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">Username or Email</span>
      <div className="relative">
        <UserCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          className="h-12 w-full border border-white/10 bg-[#111] pl-10 pr-3 text-sm text-white outline-none focus:border-white"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="username or name@storeops.com"
        />
      </div>
    </label>
  );
}

function Alert({ message, tone }: { message: string; tone: "error" | "info" }) {
  if (!message) return null;
  return (
    <p className={`border px-4 py-3 text-sm ${tone === "error" ? "border-red-900/60 bg-red-950/40 text-red-200" : "border-white/10 bg-white/5 text-zinc-200"}`}>
      {message}
    </p>
  );
}
