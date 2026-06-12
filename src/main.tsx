import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell, canAccess } from "./components/AppShell";
import { Auth } from "./pages/Auth";
import { Calendar } from "./pages/Calendar";
import { Dashboard } from "./pages/Dashboard";
import { Inventory } from "./pages/Inventory";
import { Messages } from "./pages/Messages";
import { Management, ManagementPrintJobLog, ManagementProblemLog, ManagementStaff } from "./pages/Management";
import { PrintJobs } from "./pages/PrintJobs";
import { ProblemLog } from "./pages/ProblemLog";
import { RequestsOff } from "./pages/RequestsOff";
import { Settings } from "./pages/Settings";
import { Timesheets } from "./pages/Timesheets";
import "./index.css";
import type { Role } from "./data/operations";
import { getSession } from "./lib/api";

function ProtectedPortal() {
  const session = getSession();
  return session ? <AppShell /> : <Navigate to="/auth" replace />;
}

function RequireRole({ min, children }: { min: Role; children: React.ReactNode }) {
  const session = getSession();
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return canAccess(session.user?.role ?? "Employee", min) ? children : <Navigate to="/" replace />;
}

function StoreRoleOnly({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) {
    return <Navigate to="/auth" replace />;
  }
  return session.user?.role === "Owner" ? <Navigate to="/" replace /> : children;
}

const router = createBrowserRouter([
  { path: "/auth", element: <Auth /> },
  {
    path: "/",
    element: <ProtectedPortal />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "timesheets", element: <StoreRoleOnly><Timesheets /></StoreRoleOnly> },
      { path: "calendar", element: <StoreRoleOnly><Calendar /></StoreRoleOnly> },
      { path: "problem-log", element: <StoreRoleOnly><ProblemLog /></StoreRoleOnly> },
      { path: "inventory", element: <StoreRoleOnly><Inventory /></StoreRoleOnly> },
      { path: "print-jobs", element: <StoreRoleOnly><PrintJobs /></StoreRoleOnly> },
      { path: "messages", element: <Messages /> },
      { path: "requests-off", element: <StoreRoleOnly><RequestsOff /></StoreRoleOnly> },
      {
        path: "management",
        element: <RequireRole min="Manager"><Management /></RequireRole>,
        children: [
          { index: true, element: <Navigate to="problem-log" replace /> },
          { path: "problem-log", element: <ManagementProblemLog /> },
          { path: "print-job-log", element: <ManagementPrintJobLog /> },
          { path: "staff", element: <ManagementStaff /> }
        ]
      },
      { path: "settings", element: <Settings /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
