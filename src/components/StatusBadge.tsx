import { cn } from "../lib/utils";

const tones: Record<string, string> = {
  Pending: "bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
  Active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Suspended: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  Disabled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  Paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "Due Soon": "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Overdue: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  Approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Denied: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  Open: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  "In Progress": "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Waiting: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  Resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Processing: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Completed: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
  Working: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  Scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Off: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium", tones[value] ?? tones.Pending)}>
      {value}
    </span>
  );
}
