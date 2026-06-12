import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectDb, getDbStatus, isDbConnected } from "./config/db.js";
import { seedDemoData } from "./seed.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import timesheetRoutes from "./routes/timesheets.js";
import timeOffRequestRoutes from "./routes/timeOffRequests.js";
import inventoryRoutes from "./routes/inventory.js";
import problemLogRoutes from "./routes/problemLogs.js";
import printJobRoutes from "./routes/printJobs.js";
import messageRoutes from "./routes/messages.js";
import calendarEventRoutes from "./routes/calendarEvents.js";
import auditLogRoutes from "./routes/auditLogs.js";
import notificationRoutes from "./routes/notifications.js";
import searchRoutes from "./routes/search.js";
import storeRoutes from "./routes/stores.js";
import { requireAuth, type AuthRequest } from "./middleware/auth.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const retryDelay = positiveNumber(process.env.MONGODB_RETRY_DELAY_MS, 5000);
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
let databaseConnectionPending = false;

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "30mb" }));
app.use(morgan("dev"));

app.get("/api/health", (_req, res) => {
  const database = getDbStatus();
  res.status(database.connected ? 200 : 503).json({ ok: database.connected, service: "storeops-api", database });
});

app.use("/api", (_req, res, next) => {
  if (isDbConnected()) {
    return next();
  }
  return res.status(503).json({ message: "API is running, but MongoDB is not connected yet. Check MONGODB_URI and Atlas Network Access." });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/timesheets", requireAuth, blockOwnerStoreOperations, timesheetRoutes);
app.use("/api/time-off-requests", requireAuth, blockOwnerStoreOperations, timeOffRequestRoutes);
app.use("/api/inventory", requireAuth, blockOwnerStoreOperations, inventoryRoutes);
app.use("/api/problem-logs", requireAuth, blockOwnerStoreOperations, problemLogRoutes);
app.use("/api/print-jobs", requireAuth, blockOwnerStoreOperations, printJobRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/calendar-events", requireAuth, blockOwnerStoreOperations, calendarEventRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/stores", storeRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

function startDatabase() {
  if (databaseConnectionPending || isDbConnected()) {
    return;
  }
  databaseConnectionPending = true;
  void connectDb()
    .then(seedDemoData)
    .catch((error) => {
      console.error(`MongoDB unavailable. Retrying in ${retryDelay}ms.`);
      console.error(error);
      setTimeout(startDatabase, retryDelay);
    })
    .finally(() => {
      databaseConnectionPending = false;
    });
}

app.listen(port, host, () => {
  console.log(`API running on http://${host}:${port}`);
  startDatabase();
});

function positiveNumber(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function blockOwnerStoreOperations(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (req.user?.role === "Owner") {
    return res.status(403).json({ message: "Owner accounts use portfolio, management, messages, and settings only." });
  }
  return next();
}
