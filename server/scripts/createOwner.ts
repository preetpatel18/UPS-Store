import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { syncRoleProfile } from "../models/RoleProfiles.js";
import { validatePasswordStrength } from "../utils/security.js";

const username = process.env.PLATFORM_OWNER_USERNAME?.trim().toLowerCase();
const email = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.PLATFORM_OWNER_PASSWORD;
const name = process.env.PLATFORM_OWNER_NAME?.trim() || "Platform Owner";

if (!username || !email || !password) {
  console.error("Set PLATFORM_OWNER_USERNAME, PLATFORM_OWNER_EMAIL, and PLATFORM_OWNER_PASSWORD in .env before running this script.");
  process.exit(1);
}

const passwordCheck = validatePasswordStrength(password);
if (!passwordCheck.valid) {
  console.error(passwordCheck.issues.join(" "));
  process.exit(1);
}

await connectDb();
const passwordHash = await bcrypt.hash(password, 12);
const owner = await User.findOneAndUpdate(
  { role: "Owner" },
  {
    name,
    username,
    email,
    passwordHash,
    role: "Owner",
    department: "Platform",
    status: "Active",
    store: null,
    storeName: ""
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
await syncRoleProfile(owner);

console.log(`Platform owner ready: ${owner.username} (${owner.email})`);
process.exit(0);
