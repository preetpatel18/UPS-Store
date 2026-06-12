import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function exportCsv(filename: string, rows: Record<string, string | number>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = String(row[header] ?? "");
          return `"${value.replace(/"/g, '""')}"`;
        })
        .join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
