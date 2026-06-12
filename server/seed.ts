import bcrypt from "bcryptjs";
import { User } from "./models/User.js";
import { Store } from "./models/Store.js";
import { Timesheet } from "./models/Timesheet.js";
import { TimeOffRequest } from "./models/TimeOffRequest.js";
import { InventoryItem } from "./models/InventoryItem.js";
import { InventoryCategory } from "./models/InventoryCategory.js";
import { ProblemLog } from "./models/ProblemLog.js";
import { PrintJob } from "./models/PrintJob.js";
import { Message } from "./models/Message.js";
import { CalendarEvent } from "./models/CalendarEvent.js";
import { Conversation } from "./models/Conversation.js";
import { AuditLog } from "./models/AuditLog.js";
import { Notification } from "./models/Notification.js";
import { syncRoleProfile } from "./models/RoleProfiles.js";
import { bootstrapStoreDatabase, storeDatabaseName } from "./utils/storeDatabases.js";

export async function seedDemoData() {
  await bootstrapPlatformOwner();
  await assignLegacyDataToDefaultStore();
  await syncExistingRoleProfiles();

  if (process.env.SEED_DEMO_DATA !== "true") {
    return;
  }

  const count = await User.countDocuments();
  if (count > 0) {
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 12);
  const store = await Store.create({ name: "Demo UPS Store", code: "demo-ups-store", databaseName: storeDatabaseName({ code: "demo-ups-store" }) });
  const users = await User.create([
    { name: "Jordan Lee", username: "jordan", email: "employee@storeops.com", passwordHash, role: "Employee", store: store.id, storeName: store.name, department: "Print", status: "Working" },
    { name: "Maya Chen", username: "maya", email: "manager@storeops.com", passwordHash, role: "Manager", store: store.id, storeName: store.name, department: "Operations", status: "Working" },
    { name: "Sam Rivera", username: "sam", email: "admin@storeops.com", passwordHash, role: "Administrator", store: store.id, storeName: store.name, department: "Administration", status: "Working" },
    { name: "Avery Patel", username: "avery", email: "avery@storeops.com", passwordHash, role: "Employee", store: store.id, storeName: store.name, department: "Shipping", status: "Off" },
    { name: "Taylor Brooks", username: "taylor", email: "taylor@storeops.com", passwordHash, role: "Employee", store: store.id, storeName: store.name, department: "Retail", status: "Scheduled" }
  ]);

  const [jordan, maya, sam, avery, taylor] = users;

  await Timesheet.create([
    { employee: maya.id, employeeName: maya.name, store: store.id, department: "Operations", date: "2026-05-20", clockIn: "08:02", clockOut: "16:35", breakTime: "30m", totalHours: 8.05, status: "Completed" },
    { employee: jordan.id, employeeName: jordan.name, store: store.id, department: "Print", date: "2026-05-20", clockIn: "09:01", clockOut: "17:12", breakTime: "30m", totalHours: 7.68, status: "Completed" },
    { employee: avery.id, employeeName: avery.name, store: store.id, department: "Shipping", date: "2026-05-21", clockIn: "10:00", clockOut: "18:08", breakTime: "45m", totalHours: 7.38, status: "Completed" }
  ]);

  await TimeOffRequest.create([
    { employee: jordan.id, employeeName: jordan.name, store: store.id, date: "2026-06-03", start: "09:00", end: "17:00", reason: "Appointment", notes: "Can trade with Taylor.", status: "Pending" },
    { employee: avery.id, employeeName: avery.name, store: store.id, date: "2026-06-08", start: "10:00", end: "18:00", reason: "Family event", notes: "Submitted two weeks ahead.", status: "Approved" }
  ]);

  await InventoryItem.create([
    { name: "Thermal Labels 4x6", store: store.id, sku: "LBL-46-UPS", category: "Labels", quantity: 18, threshold: 24 },
    { name: "Matte Poster Roll 24in", store: store.id, sku: "PRT-MAT-24", category: "Paper", quantity: 6, threshold: 5 },
    { name: "Black Toner C778", store: store.id, sku: "TON-C778-K", category: "Print Supplies", quantity: 3, threshold: 4 }
  ]);

  await ProblemLog.create([
    { category: "Equipment", store: store.id, priority: "High", status: "Open", description: "Large-format printer banding on matte paper.", owner: jordan.id, ownerName: jordan.name },
    { category: "Customer", store: store.id, priority: "Medium", status: "In Progress", description: "Mailbox customer missing forwarded parcel scan.", owner: avery.id, ownerName: avery.name }
  ]);

  await PrintJob.create([
    { customer: "Northline Dental", store: store.id, type: "Business cards", description: "500 cards, matte finish, use approved dental logo proof.", pricingInfo: "$89 quoted, paid in full.", status: "Processing", due: "2026-05-27", createdBy: jordan.id, createdByName: jordan.name },
    { customer: "BrightPath Realty", store: store.id, type: "Window posters", description: "Two 24x36 window posters on satin paper.", pricingInfo: "$64 estimate, collect before pickup.", status: "Waiting", due: "2026-05-28", createdBy: maya.id, createdByName: maya.name },
    { customer: "Civic Theater", store: store.id, type: "Program booklets", description: "100 saddle-stitched program booklets, black and white interior.", pricingInfo: "$240 invoice, net 7.", status: "Ready", due: "2026-05-26", createdBy: maya.id, createdByName: maya.name }
  ]);

  await Message.create([
    { from: maya.id, store: store.id, fromName: maya.name, recipients: [jordan.id, taylor.id], subject: "Coverage for Friday close", body: "Please confirm who can stay through the final pickup window." },
    { from: sam.id, store: store.id, fromName: sam.name, recipients: [maya.id], subject: "Payroll export reviewed", body: "The bi-weekly hours file is ready for final approval." }
  ]);

  await CalendarEvent.create([
    { title: "Maya 8-4, Jordan 9-5", store: store.id, type: "Shift", date: "2026-05-27", start: "08:00", end: "17:00" },
    { title: "Avery approved time off", store: store.id, type: "Time Off", employee: avery.id, employeeName: avery.name, date: "2026-06-08", start: "10:00", end: "18:00" }
  ]);
  await bootstrapStoreDatabase(store, users);

  console.log("Demo data seeded");
}

async function assignLegacyDataToDefaultStore() {
  const legacyUsers = await User.countDocuments({ role: { $ne: "Owner" }, $or: [{ store: null }, { store: { $exists: false } }] });
  const legacyRecords = await Promise.all([
    Timesheet.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    TimeOffRequest.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    InventoryItem.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    InventoryCategory.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    ProblemLog.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    PrintJob.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    Message.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    Conversation.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    CalendarEvent.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    AuditLog.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] }),
    Notification.countDocuments({ $or: [{ store: null }, { store: { $exists: false } }] })
  ]);
  if (!legacyUsers && legacyRecords.every((count) => count === 0)) return;

  const store = await Store.findOneAndUpdate(
    { code: "legacy-default-store" },
    { name: "Default UPS Store", code: "legacy-default-store", databaseName: storeDatabaseName({ code: "legacy-default-store" }), status: "Active" },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const missingStore = { $or: [{ store: null }, { store: { $exists: false } }] };
  await Promise.all([
    User.updateMany({ role: { $ne: "Owner" }, ...missingStore }, { store: store._id, storeName: store.name }),
    Timesheet.updateMany(missingStore, { store: store._id }),
    TimeOffRequest.updateMany(missingStore, { store: store._id }),
    InventoryItem.updateMany(missingStore, { store: store._id }),
    InventoryCategory.updateMany(missingStore, { store: store._id }),
    ProblemLog.updateMany(missingStore, { store: store._id }),
    PrintJob.updateMany(missingStore, { store: store._id }),
    Message.updateMany(missingStore, { store: store._id }),
    Conversation.updateMany(missingStore, { store: store._id }),
    CalendarEvent.updateMany(missingStore, { store: store._id }),
    AuditLog.updateMany(missingStore, { store: store._id }),
    Notification.updateMany(missingStore, { store: store._id })
  ]);
  const staff = await User.find({ store: store._id }).select("-passwordHash");
  await bootstrapStoreDatabase(store, staff);
  console.log("Legacy data assigned to Default UPS Store");
}

async function bootstrapPlatformOwner() {
  const existingOwner = await User.exists({ role: "Owner" });
  if (existingOwner) return;

  const password = process.env.PLATFORM_OWNER_PASSWORD;
  const username = process.env.PLATFORM_OWNER_USERNAME;
  const email = process.env.PLATFORM_OWNER_EMAIL;
  if (!password || !username || !email) {
    console.warn("No platform owner exists. Set PLATFORM_OWNER_USERNAME, PLATFORM_OWNER_EMAIL, and PLATFORM_OWNER_PASSWORD, then run npm run create:owner.");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await User.create({
    name: process.env.PLATFORM_OWNER_NAME ?? "Platform Owner",
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    passwordHash,
    role: "Owner",
    department: "Platform",
    status: "Active"
  });
  await syncRoleProfile(owner);
  console.log("Platform owner account created");
}

async function syncExistingRoleProfiles() {
  const users = await User.find();
  await Promise.all(users.map((user) => syncRoleProfile(user)));
}
