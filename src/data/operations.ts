export type Role = "Employee" | "Manager" | "Administrator" | "Owner";

export const employees = [
  { id: "u1", name: "Maya Chen", role: "Manager", department: "Operations", status: "Working", hours: 37.5 },
  { id: "u2", name: "Jordan Lee", role: "Employee", department: "Print", status: "Working", hours: 32.25 },
  { id: "u3", name: "Avery Patel", role: "Employee", department: "Shipping", status: "Off", hours: 29.5 },
  { id: "u4", name: "Sam Rivera", role: "Administrator", department: "Administration", status: "Working", hours: 41.75 },
  { id: "u5", name: "Taylor Brooks", role: "Employee", department: "Retail", status: "Scheduled", hours: 24 }
];

export const timesheets = [
  { employee: "Maya Chen", date: "2026-05-20", clockIn: "08:02", clockOut: "16:35", breakTime: "30m", totalHours: 8.05, department: "Operations" },
  { employee: "Jordan Lee", date: "2026-05-20", clockIn: "09:01", clockOut: "17:12", breakTime: "30m", totalHours: 7.68, department: "Print" },
  { employee: "Avery Patel", date: "2026-05-21", clockIn: "10:00", clockOut: "18:08", breakTime: "45m", totalHours: 7.38, department: "Shipping" },
  { employee: "Taylor Brooks", date: "2026-05-22", clockIn: "12:01", clockOut: "20:04", breakTime: "30m", totalHours: 7.55, department: "Retail" },
  { employee: "Sam Rivera", date: "2026-05-22", clockIn: "07:55", clockOut: "16:10", breakTime: "30m", totalHours: 7.75, department: "Administration" }
];

export const schedule = [
  { day: "Mon", shift: "Maya 8-4, Jordan 9-5", coverage: 92 },
  { day: "Tue", shift: "Avery 10-6, Taylor 12-8", coverage: 86 },
  { day: "Wed", shift: "Jordan 8-4, Maya 11-7", coverage: 94 },
  { day: "Thu", shift: "Taylor 9-5, Avery 10-6", coverage: 79 },
  { day: "Fri", shift: "All hands 9-6", coverage: 98 }
];

export const timeOffRequests = [
  { id: "r1", employee: "Jordan Lee", date: "2026-06-03", start: "09:00", end: "17:00", reason: "Appointment", notes: "Can trade with Taylor.", status: "Pending" },
  { id: "r2", employee: "Avery Patel", date: "2026-06-08", start: "10:00", end: "18:00", reason: "Family event", notes: "Submitted two weeks ahead.", status: "Approved" },
  { id: "r3", employee: "Taylor Brooks", date: "2026-06-10", start: "12:00", end: "20:00", reason: "Class registration", notes: "Open to partial shift.", status: "Pending" }
];

export const problemLogs = [
  { id: "p1", category: "Equipment", priority: "High", status: "Open", description: "Large-format printer banding on matte paper.", date: "2026-05-23", owner: "Jordan Lee", comments: 4 },
  { id: "p2", category: "Customer", priority: "Medium", status: "In Progress", description: "Mailbox customer missing forwarded parcel scan.", date: "2026-05-24", owner: "Avery Patel", comments: 2 },
  { id: "p3", category: "Facility", priority: "Low", status: "Waiting", description: "Back counter label dispenser needs replacement blade.", date: "2026-05-25", owner: "Taylor Brooks", comments: 1 }
];

export const inventory = [
  { name: "Thermal Labels 4x6", sku: "LBL-46-UPS", quantity: 18, location: "Shipping wall", threshold: 24 },
  { name: "Matte Poster Roll 24in", sku: "PRT-MAT-24", quantity: 6, location: "Print storage", threshold: 5 },
  { name: "Padded Mailers Medium", sku: "MAIL-PAD-M", quantity: 42, location: "Retail aisle", threshold: 30 },
  { name: "Black Toner C778", sku: "TON-C778-K", quantity: 3, location: "Admin cabinet", threshold: 4 }
];

export const printJobs = [
  { id: "j1", customer: "Northline Dental", type: "Business cards", status: "Processing", due: "2026-05-27", assigned: "Jordan Lee" },
  { id: "j2", customer: "BrightPath Realty", type: "Window posters", status: "Waiting", due: "2026-05-28", assigned: "Unassigned" },
  { id: "j3", customer: "Civic Theater", type: "Program booklets", status: "Ready", due: "2026-05-26", assigned: "Maya Chen" },
  { id: "j4", customer: "Summit Law", type: "Bound packets", status: "Completed", due: "2026-05-25", assigned: "Avery Patel" }
];

export const messages = [
  { from: "Maya Chen", subject: "Coverage for Friday close", preview: "Please confirm who can stay through the final pickup window.", time: "10:42 AM", unread: true },
  { from: "Sam Rivera", subject: "Payroll export reviewed", preview: "The bi-weekly hours file is ready for final approval.", time: "9:18 AM", unread: false },
  { from: "Jordan Lee", subject: "Poster job proof", preview: "Customer approved proof B. Moving to production.", time: "Yesterday", unread: false }
];

export const notes = [
  { title: "Mailbox renewal calls", category: "Customer follow-up", state: "Draft", body: "Call accounts expiring before June 15." },
  { title: "Saturday production checklist", category: "Print", state: "Published", body: "Calibrate cutter, verify laminate stock, stage orders by due date." },
  { title: "Store-wide: claims process", category: "Announcement", state: "Store-wide", body: "Use the updated claim form for damaged package reports." }
];

export const auditLogs = [
  { user: "Sam Rivera", action: "Changed Jordan Lee permission to Print Lead", time: "2026-05-25 16:22" },
  { user: "Maya Chen", action: "Approved Avery Patel time-off request", time: "2026-05-24 13:08" },
  { user: "System", action: "Low stock alert created for Thermal Labels 4x6", time: "2026-05-24 08:15" }
];

export const laborHours = [
  { day: "Mon", hours: 38 },
  { day: "Tue", hours: 34 },
  { day: "Wed", hours: 41 },
  { day: "Thu", hours: 36 },
  { day: "Fri", hours: 44 },
  { day: "Sat", hours: 28 },
  { day: "Sun", hours: 12 }
];
