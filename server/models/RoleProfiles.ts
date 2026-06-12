import mongoose, { Schema } from "mongoose";

const profileFields = {
  authUser: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, default: "", lowercase: true, trim: true },
  username: { type: String, required: true, lowercase: true, trim: true, index: true },
  assignedStoreId: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
  storeName: { type: String, default: "" },
  status: { type: String, default: "Active", index: true },
  lastLogin: { type: Date, default: null }
};

const ownerProfileSchema = new Schema(
  {
    ownerId: { type: String, required: true, unique: true, index: true },
    ...profileFields,
    role: { type: String, enum: ["owner"], default: "owner" }
  },
  { timestamps: true }
);

const adminProfileSchema = new Schema(
  {
    adminId: { type: String, required: true, unique: true, index: true },
    ...profileFields,
    role: { type: String, enum: ["admin"], default: "admin" }
  },
  { timestamps: true }
);

const managerProfileSchema = new Schema(
  {
    managerId: { type: String, required: true, unique: true, index: true },
    ...profileFields,
    role: { type: String, enum: ["manager"], default: "manager" }
  },
  { timestamps: true }
);

const employeeProfileSchema = new Schema(
  {
    employeeId: { type: String, required: true, unique: true, index: true },
    ...profileFields,
    role: { type: String, enum: ["employee"], default: "employee" }
  },
  { timestamps: true }
);

export const OwnerProfile = mongoose.model("OwnerProfile", ownerProfileSchema);
export const AdminProfile = mongoose.model("AdminProfile", adminProfileSchema);
export const ManagerProfile = mongoose.model("ManagerProfile", managerProfileSchema);
export const EmployeeProfile = mongoose.model("EmployeeProfile", employeeProfileSchema);

export async function syncRoleProfile(user: any) {
  const common = {
    authUser: user._id,
    name: user.name,
    email: user.email ?? "",
    username: user.username ?? user.email?.split("@")[0] ?? user.id,
    assignedStoreId: user.store ?? null,
    storeName: user.storeName ?? "",
    status: normalizeStatus(user.status),
    lastLogin: user.lastLogin ?? null
  };

  if (user.role === "Owner") {
    await OwnerProfile.findOneAndUpdate({ authUser: user._id }, { ownerId: user.id, ...common }, { upsert: true, new: true });
  }
  if (user.role === "Administrator") {
    await AdminProfile.findOneAndUpdate({ authUser: user._id }, { adminId: user.id, ...common }, { upsert: true, new: true });
  }
  if (user.role === "Manager") {
    await ManagerProfile.findOneAndUpdate({ authUser: user._id }, { managerId: user.id, ...common }, { upsert: true, new: true });
  }
  if (user.role === "Employee") {
    await EmployeeProfile.findOneAndUpdate({ authUser: user._id }, { employeeId: user.id, ...common }, { upsert: true, new: true });
  }
}

function normalizeStatus(status?: string) {
  if (status === "Inactive" || status === "Disabled") return "Disabled";
  if (status === "Pending" || status === "Scheduled") return "Pending";
  return "Active";
}
