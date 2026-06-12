import { Notification } from "../models/Notification.js";
import { User, type UserRole } from "../models/User.js";

type NotificationDetails = {
  title: string;
  body?: string;
  type?: "Info" | "Request" | "Message" | "Alert";
  category?: "messages" | "requests" | "operations" | "security";
  store?: string | null | { toString(): string };
  link?: string;
};

export async function notifyUsers(recipients: Array<{ toString(): string } | string>, details: NotificationDetails) {
  const ids = Array.from(new Set(recipients.map((recipient) => recipient.toString()).filter(Boolean)));
  if (!ids.length) return;

  try {
    const category = details.category ?? categoryFromType(details.type);
    const users = await User.find({ _id: { $in: ids }, status: { $ne: "Inactive" } }).select("store notificationPreferences");
    const enabledUsers = users.filter((user: any) => {
      const preferences = user.notificationPreferences ?? {};
      return preferences.inApp !== false && preferences[category] !== false;
    });

    if (!enabledUsers.length) return;
    await Notification.insertMany(enabledUsers.map((user: any) => ({ recipient: user._id, store: details.store ?? user.store ?? null, category, ...details })));
  } catch (error) {
    console.error("Could not create notifications", error);
  }
}

export async function notifyRoles(roles: UserRole[], details: NotificationDetails, exclude?: string) {
  const users = await User.find({
    role: { $in: roles },
    ...(details.store ? { store: details.store } : {}),
    ...(exclude ? { _id: { $ne: exclude } } : {})
  }).select("_id store notificationPreferences");
  await notifyUsers(users.map((user) => user._id), details);
}

function categoryFromType(type: NotificationDetails["type"]) {
  if (type === "Message") return "messages";
  if (type === "Request") return "requests";
  if (type === "Alert") return "operations";
  return "operations";
}
