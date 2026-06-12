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
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is missing. Copy .env.example to .env and add your MongoDB Atlas connection string.");
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
