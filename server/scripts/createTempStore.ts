import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "../config/db.js";
import { Store } from "../models/Store.js";
import { User } from "../models/User.js";
import { syncRoleProfile } from "../models/RoleProfiles.js";
import { bootstrapStoreDatabase, storeDatabaseName } from "../utils/storeDatabases.js";

const username = "store8099admin";
const password = "TempStore8099A1";

await connectDb();

const store = await Store.findOneAndUpdate(
  { code: "temp-store-8099" },
  {
    name: "Temporary UPS Store 8099",
    code: "temp-store-8099",
    databaseName: storeDatabaseName({ storeNumber: "8099", code: "temp-store-8099" }),
    storeNumber: "8099",
    address: "Temporary Store",
    status: "Active",
    websiteStatus: "Active",
    paymentType: "Monthly Subscription",
    priceSold: 0,
    monthlySubscriptionPrice: 0,
    nextDueDate: "",
    paymentStatus: "Paid",
    notes: "Temporary store created for Owner testing."
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

const passwordHash = await bcrypt.hash(password, 12);
const admin = await User.findOneAndUpdate(
  { username },
  {
    name: "Temp Store 8099 Admin",
    username,
    email: "store8099admin@storeops.local",
    passwordHash,
    role: "Administrator",
    store: store._id,
    storeName: store.name,
    department: "Administration",
    status: "Active"
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);

await Store.findByIdAndUpdate(store._id, { ownerAdmin: admin._id });
await syncRoleProfile(admin);
await bootstrapStoreDatabase(store, [admin]);

console.log(JSON.stringify({
  store: store.name,
  storeNumber: store.storeNumber,
  databaseName: store.databaseName,
  username,
  password,
  email: admin.email
}, null, 2));

process.exit(0);
