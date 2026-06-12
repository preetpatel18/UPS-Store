import mongoose from "mongoose";

type StoreLike = {
  _id?: unknown;
  id?: string;
  name?: string;
  code?: string;
  storeNumber?: string;
  databaseName?: string;
  address?: string;
  websiteStatus?: string;
  paymentType?: string;
  priceSold?: number;
  monthlySubscriptionPrice?: number;
  nextDueDate?: string;
  paymentStatus?: string;
  notes?: string;
};

type StaffLike = {
  _id?: unknown;
  id?: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  role?: string | null;
  status?: string | null;
  lastLogin?: Date | null;
};

export function storeDatabaseName(store: Pick<StoreLike, "databaseName" | "storeNumber" | "code" | "name">) {
  if (store.databaseName) return store.databaseName;
  const base = store.storeNumber || store.code || store.name || "store";
  return `storeops_${slugDatabaseName(base)}`;
}

export function slugDatabaseName(value: string) {
  return value
    .toLowerCase()
    .replace(/^storeops[_-]?/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || `store_${Date.now()}`;
}

export async function bootstrapStoreDatabase(store: StoreLike, staff: StaffLike[] = []) {
  const dbName = storeDatabaseName(store);
  const db = mongoose.connection.useDb(dbName, { useCache: true });
  const now = new Date();
  const storeId = String(store._id ?? store.id ?? "");

  await db.collection("storeprofile").updateOne(
    { storeId },
    {
      $set: {
        storeId,
        storeName: store.name ?? "",
        storeNumber: store.storeNumber ?? "",
        code: store.code ?? "",
        address: store.address ?? "",
        websiteStatus: store.websiteStatus ?? "Pending",
        paymentType: store.paymentType ?? "Monthly Subscription",
        priceSold: store.priceSold ?? 0,
        monthlySubscriptionPrice: store.monthlySubscriptionPrice ?? 0,
        nextDueDate: store.nextDueDate ?? "",
        paymentStatus: store.paymentStatus ?? "Due Soon",
        notes: store.notes ?? "",
        ownerDatabase: mongoose.connection.db?.databaseName ?? "",
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );

  for (const person of staff) {
    const collection = person.role === "Administrator"
      ? "admins"
      : person.role === "Manager"
        ? "managers"
        : "employees";
    await db.collection(collection).updateOne(
      { authUserId: String(person._id ?? person.id ?? "") },
      {
        $set: {
          authUserId: String(person._id ?? person.id ?? ""),
          name: person.name ?? "",
          email: person.email ?? "",
          username: person.username ?? "",
          role: person.role ?? "",
          status: person.status ?? "Active",
          lastLogin: person.lastLogin ?? null,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    );
  }

  await Promise.all([
    ensureCollection(db, "conversations"),
    ensureCollection(db, "messages"),
    ensureCollection(db, "notifications"),
    ensureCollection(db, "auditlogs"),
    ensureCollection(db, "employees"),
    ensureCollection(db, "timesheets"),
    ensureCollection(db, "inventoryitems"),
    ensureCollection(db, "inventorycategories"),
    ensureCollection(db, "printjobs"),
    ensureCollection(db, "problemlogs"),
    ensureCollection(db, "calendarevents"),
    ensureCollection(db, "timeoffrequests")
  ]);

  return dbName;
}

export async function dropStoreDatabase(databaseName?: string) {
  if (!databaseName) return;
  if (!databaseName.startsWith("storeops_")) return;
  const db = mongoose.connection.useDb(databaseName, { useCache: true });
  await db.dropDatabase();
}

async function ensureCollection(db: mongoose.Connection, name: string) {
  const exists = await db.db?.listCollections({ name }).hasNext();
  if (!exists) {
    await db.createCollection(name);
  }
}
