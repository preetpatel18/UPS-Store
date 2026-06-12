import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("glass-panel min-w-0 rounded-xl border border-white/70 p-4 shadow-soft dark:border-white/10", className)}>{children}</section>;
}

export function CardTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail ? <p className="mt-1 text-xs text-mutedForeground">{detail}</p> : null}
      </div>
    </div>
  );
}
