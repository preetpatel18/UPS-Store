import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "../config/db.js";
import { Store } from "../models/Store.js";
import { User } from "../models/User.js";
import { syncRoleProfile } from "../models/RoleProfiles.js";
import { bootstrapStoreDatabase, storeDatabaseName } from "../utils/storeDatabases.js";

const stores = [
  {
    name: "Temporary UPS Store 1201",
    code: "temp-store-1201",
    storeNumber: "1201",
    address: "1201 Sample Plaza",
    paymentType: "One-Time Purchase",
    priceSold: 2500,
    monthlySubscriptionPrice: 0,
    nextDueDate: "",
    paymentStatus: "Paid",
    admin: {
      name: "Store 1201 Admin",
      username: "store1201admin",
      email: "store1201admin@storeops.local",
      password: "TempStore1201A1"
    },
    manager: {
      name: "Store 1201 Manager",
      username: "store1201manager",
      email: "store1201manager@storeops.local",
      password: "TempStore1201M1"
    }
  },
  {
    name: "Temporary UPS Store 2045",
    code: "temp-store-2045",
    storeNumber: "2045",
    address: "2045 Demo Road",
    paymentType: "Monthly Subscription",
    priceSold: 500,
    monthlySubscriptionPrice: 199,
    nextDueDate: "2026-07-01",
    paymentStatus: "Due Soon",
    admin: {
      name: "Store 2045 Admin",
      username: "store2045admin",
      email: "store2045admin@storeops.local",
      password: "TempStore2045A1"
    },
    manager: {
      name: "Store 2045 Manager",
      username: "store2045manager",
      email: "store2045manager@storeops.local",
      password: "TempStore2045M1"
    }
  },
  {
    name: "Temporary UPS Store 3310",
    code: "temp-store-3310",
    storeNumber: "3310",
    address: "3310 Test Avenue",
    paymentType: "Monthly Subscription",
    priceSold: 750,
    monthlySubscriptionPrice: 249,
    nextDueDate: "2026-06-01",
    paymentStatus: "Overdue",
    admin: {
      name: "Store 3310 Admin",
      username: "store3310admin",
      email: "store3310admin@storeops.local",
      password: "TempStore3310A1"
    },
    manager: {
      name: "Store 3310 Manager",
      username: "store3310manager",
      email: "store3310manager@storeops.local",
      password: "TempStore3310M1"
    }
  }
];

await connectDb();

const created = [];

for (const item of stores) {
  const store = await Store.findOneAndUpdate(
    { code: item.code },
    {
      name: item.name,
      code: item.code,
      databaseName: storeDatabaseName({ storeNumber: item.storeNumber, code: item.code }),
      storeNumber: item.storeNumber,
      address: item.address,
      status: "Active",
      websiteStatus: "Active",
      paymentType: item.paymentType,
      priceSold: item.priceSold,
      monthlySubscriptionPrice: item.monthlySubscriptionPrice,
      nextDueDate: item.nextDueDate,
      paymentStatus: item.paymentStatus,
      notes: `Sample store ${item.storeNumber} created for Owner portfolio testing.`
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const admin = await upsertStoreUser(item.admin, "Administrator", store._id, store.name);
  const manager = await upsertStoreUser(item.manager, "Manager", store._id, store.name);
  await Store.findByIdAndUpdate(store._id, { ownerAdmin: admin._id });
  await bootstrapStoreDatabase(store, [admin, manager]);

  created.push({
    storeId: store.id,
    databaseName: store.databaseName,
    storeName: store.name,
    storeNumber: store.storeNumber,
    code: store.code,
    adminUsername: item.admin.username,
    adminPassword: item.admin.password,
    managerUsername: item.manager.username,
    managerPassword: item.manager.password
  });
}

console.log(JSON.stringify(created, null, 2));
process.exit(0);

async function upsertStoreUser(
  user: { name: string; username: string; email: string; password: string },
  role: "Administrator" | "Manager",
  storeId: unknown,
  storeName: string
) {
  const passwordHash = await bcrypt.hash(user.password, 12);
  const record = await User.findOneAndUpdate(
    { username: user.username },
    {
      name: user.name,
      username: user.username,
      email: user.email,
      passwordHash,
      role,
      store: storeId,
      storeName,
      department: role === "Administrator" ? "Administration" : "Operations",
      status: "Active"
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await syncRoleProfile(record);
  return record;
}
