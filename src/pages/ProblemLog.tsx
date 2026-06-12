import { useEffect, useState } from "react";
import { CheckCircle2, CircleDot, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

type ProblemLog = {
  _id: string;
  category: string;
  priority: "Low" | "Medium" | "High";
  status: "Open" | "In Progress" | "Waiting" | "Resolved";
  description: string;
  ownerName: string;
  createdAt: string;
};

const priorities: ProblemLog["priority"][] = ["High", "Medium", "Low"];

export function ProblemLog() {
  const [problems, setProblems] = useState<ProblemLog[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [draggedId, setDraggedId] = useState("");
  const [dropPriority, setDropPriority] = useState<ProblemLog["priority"] | "">("");
  const [draft, setDraft] = useState({ category: "", priority: "High" as ProblemLog["priority"], description: "" });

  useEffect(() => {
    void apiFetch<ProblemLog[]>("/problem-logs").then(setProblems);
  }, []);

  async function createProblem() {
    try {
      const created = await apiFetch<ProblemLog>("/problem-logs", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setProblems((current) => [created, ...current]);
      setDraft({ category: "", priority: "High", description: "" });
      setNotice("Problem report saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save problem report.");
    }
  }

  async function updateProblem(id: string, update: { status?: "In Progress" | "Resolved"; priority?: ProblemLog["priority"]; description?: string }) {
    if (update.status === "Resolved" && !window.confirm("Are you sure this problem is resolved? It will move to the Manager/Admin archive.")) {
      return;
    }

    const updated = await apiFetch<ProblemLog>(`/problem-logs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...update,
        comment: update.status ? `Status changed to ${update.status}` : "Description updated"
      })
    });
    setProblems((current) => update.status === "Resolved" ? current.filter((problem) => problem._id !== id) : current.map((problem) => (problem._id === id ? updated : problem)));
    setEdits((current) => ({ ...current, [id]: updated.description }));
  }

  async function moveProblem(id: string, priority: ProblemLog["priority"]) {
    const problem = problems.find((item) => item._id === id);
    setDraggedId("");
    setDropPriority("");
    if (!problem || problem.priority === priority) return;

    setProblems((current) => current.map((item) => item._id === id ? { ...item, priority } : item));
    try {
      const updated = await apiFetch<ProblemLog>(`/problem-logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ priority })
      });
      setProblems((current) => current.map((item) => item._id === id ? updated : item));
      setNotice(`Problem moved to ${priority.toLowerCase()} priority.`);
    } catch (error) {
      setProblems((current) => current.map((item) => item._id === id ? problem : item));
      setNotice(error instanceof Error ? error.message : "Could not update priority.");
    }
  }

  async function deleteProblem(problem: ProblemLog) {
    if (!window.confirm(`Delete the ${problem.category} problem report? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/problem-logs/${problem._id}`, { method: "DELETE" });
      setProblems((current) => current.filter((item) => item._id !== problem._id));
      setNotice("Problem report deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete problem report.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle title="Create Problem Report" detail="Track issues by priority and status" />
        <div className="grid gap-3 lg:grid-cols-4">
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Category (optional)" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          <select className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as ProblemLog["priority"] })}><option>High</option><option>Medium</option><option>Low</option></select>
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80 lg:col-span-2" placeholder="Description (optional)" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={createProblem}><Plus className="h-4 w-4" /> Submit</button>
        </div>
        {notice ? <p className="mt-3 text-sm text-mutedForeground">{notice}</p> : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {priorities.map((priority) => {
          const laneProblems = problems.filter((problem) => problem.priority === priority);
          return (
            <section
              key={priority}
              className={cn(
                "rounded-2xl border bg-white/45 p-3 shadow-soft transition dark:bg-zinc-900/45",
                dropPriority === priority && "border-zinc-950 bg-white ring-2 ring-zinc-950/20 dark:border-white dark:bg-zinc-900 dark:ring-white/20"
              )}
              onDragOver={(event) => {
                event.preventDefault();
                setDropPriority(priority);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropPriority("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/plain") || draggedId;
                if (id) void moveProblem(id, priority);
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{priority} Priority</h2>
                <span className="rounded-full bg-muted px-2 py-1 text-xs text-mutedForeground">{laneProblems.length}</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 xl:block xl:space-y-3 xl:overflow-visible xl:pb-0">
                {laneProblems.length === 0 ? <p className="min-w-72 rounded-xl border bg-white/60 p-6 text-center text-sm text-mutedForeground dark:bg-zinc-900/50">No {priority.toLowerCase()} priority problems</p> : null}
                {laneProblems.map((problem) => (
                  <Card
                    key={problem._id}
                    className={cn("min-w-[320px] xl:min-w-0", draggedId === problem._id && "opacity-45")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{problem.category}</p>
                        <p className="mt-1 text-xs text-mutedForeground">{new Date(problem.createdAt).toLocaleDateString()} · {problem.ownerName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge value={problem.status} />
                        <button
                          className="hidden h-8 w-8 cursor-grab items-center justify-center rounded-lg border bg-white/70 shadow-sm active:cursor-grabbing dark:bg-zinc-900/70 xl:flex"
                          draggable
                          aria-label={`Move ${problem.category} problem`}
                          title="Drag to change priority"
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", problem._id);
                            setDraggedId(problem._id);
                          }}
                          onDragEnd={() => {
                            setDraggedId("");
                            setDropPriority("");
                          }}
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <label className="mt-4 block">
                      <span className="mb-2 block text-xs font-medium text-mutedForeground">Description</span>
                      <textarea
                        className="min-h-28 w-full rounded-xl border bg-white/80 p-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring dark:bg-zinc-900/80"
                        value={edits[problem._id] ?? problem.description}
                        onChange={(event) => setEdits((current) => ({ ...current, [problem._id]: event.target.value }))}
                      />
                    </label>
                    <div className="mt-4 border-t pt-3 text-xs text-mutedForeground">{problem.priority} priority</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="inline-flex h-8 items-center gap-2 rounded-xl border bg-white/70 px-3 text-xs shadow-sm dark:bg-zinc-900/70" onClick={() => updateProblem(problem._id, { description: edits[problem._id] ?? problem.description })}>
                        <Save className="h-3.5 w-3.5" /> Save
                      </button>
                      <button
                        className={cn(
                          "inline-flex h-8 items-center gap-2 rounded-xl border px-3 text-xs shadow-sm",
                          problem.status === "In Progress" ? "bg-primary text-primaryForeground" : "bg-white/70 dark:bg-zinc-900/70"
                        )}
                        onClick={() => updateProblem(problem._id, { status: "In Progress" })}
                      >
                        <CircleDot className="h-3.5 w-3.5" /> In Progress
                      </button>
                      <button
                        className={cn(
                          "inline-flex h-8 items-center gap-2 rounded-xl border px-3 text-xs shadow-sm",
                          problem.status === "Resolved" ? "bg-primary text-primaryForeground" : "bg-white/70 dark:bg-zinc-900/70"
                        )}
                        onClick={() => updateProblem(problem._id, { status: "Resolved" })}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                      </button>
                      <button className="inline-flex h-8 items-center gap-2 rounded-xl border border-red-200 bg-white/70 px-3 text-xs text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/70 dark:text-red-300" onClick={() => deleteProblem(problem)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
