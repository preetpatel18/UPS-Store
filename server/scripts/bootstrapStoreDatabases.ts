import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { Store } from "../models/Store.js";
import { User } from "../models/User.js";
import { bootstrapStoreDatabase, storeDatabaseName } from "../utils/storeDatabases.js";

await connectDb();

const stores = await Store.find().sort({ storeNumber: 1, name: 1 });
const output = [];

for (const store of stores) {
  if (!store.databaseName) {
    store.databaseName = storeDatabaseName(store);
    await store.save();
  }

  const staff = await User.find({ store: store._id, role: { $in: ["Administrator", "Manager", "Employee"] } }).select("-passwordHash");
  const databaseName = await bootstrapStoreDatabase(store, staff);
  output.push({
    storeId: store.id,
    storeName: store.name,
    storeNumber: store.storeNumber,
    databaseName,
    staff: staff.length
  });
}

console.log(JSON.stringify({
  ownerDatabase: mongoose.connection.db?.databaseName,
  storeDatabases: output
}, null, 2));

process.exit(0);
