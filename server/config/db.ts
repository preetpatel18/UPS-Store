import mongoose from "mongoose";

const connectionStates: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized"
};
let lastConnectionError = "";

export async function connectDb() {
  const uri = normalizeMongoUri(process.env.MONGODB_URI);

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Copy .env.example to .env and add your MongoDB Atlas connection string.");
  }

  if (!isMongoUri(uri)) {
    throw new Error(
      "MONGODB_URI is invalid. In Render, set key MONGODB_URI and paste only the value starting with mongodb+srv:// or mongodb://. Do not include MONGODB_URI= or quotes."
    );
  }

  const databaseName = process.env.MONGODB_DB_NAME?.trim();
  const timeout = positiveNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10000);

  try {
    await mongoose.connect(uri, {
      ...(databaseName ? { dbName: databaseName } : {}),
      serverSelectionTimeoutMS: timeout
    });
    lastConnectionError = "";
    console.log("MongoDB connected");
  } catch (error) {
    lastConnectionError = error instanceof Error ? error.message.split("\n")[0] : "MongoDB connection failed";
    throw error;
  }
}

export function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDbStatus() {
  const state = connectionStates[mongoose.connection.readyState] ?? "unknown";
  return {
    connected: isDbConnected(),
    state,
    ...(lastConnectionError ? { lastError: lastConnectionError } : {})
  };
}

function positiveNumber(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeMongoUri(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  const withoutAssignment = trimmed.replace(/^MONGODB_URI\s*=\s*/i, "").trim();
  return stripOuterQuotes(withoutAssignment);
}

function stripOuterQuotes(value: string) {
  if (value.length < 2) {
    return value;
  }

  const first = value[0];
  const last = value[value.length - 1];
  const hasMatchingQuotes = (first === '"' && last === '"') || (first === "'" && last === "'");

  return hasMatchingQuotes ? value.slice(1, -1).trim() : value;
}

function isMongoUri(value: string) {
  return value.startsWith("mongodb://") || value.startsWith("mongodb+srv://");
}
