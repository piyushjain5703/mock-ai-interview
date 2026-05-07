import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type InterviewHistoryItem } from "../api";
import { useAuth } from "../auth/AuthContext";

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "hr", label: "HR" },
  { value: "technical", label: "Technical" },
  { value: "dsa", label: "DSA" },
  { value: "system_design", label: "System Design" },
];

export default function HistoryPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<InterviewHistoryItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getHistory(token, { limit: 100, interview_type: filter || undefined })
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, [token, filter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-ink-900">Interview History</h1>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="text-input-plain max-w-[200px]"
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {loading ? (
        <div className="surface-card p-8 grid place-items-center">
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="surface-card p-8 text-center text-ink-500">
          No interviews found. <Link to="/interview/new" className="text-brand-600 hover:underline">Start one</Link>.
        </div>
      ) : (
        <ul className="surface-card divide-y divide-ink-600/10">
          {items.map((iv) => (
            <li key={iv.id}>
              <Link
                to={iv.status === "ended" ? `/interview/${iv.id}/feedback` : `/interview/${iv.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium text-ink-900 truncate">{iv.target_role}</p>
                  <p className="text-xs text-ink-500 capitalize">
                    {iv.interview_type.replace("_", " ")} · {iv.difficulty} · {iv.duration_minutes} min ·{" "}
                    {new Date(iv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {iv.overall_score != null && <ScorePill score={iv.overall_score} />}
                  <span className={`pill ${statusClass(iv.status)} capitalize`}>
                    {iv.status.replace("_", " ")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const c = score >= 7 ? "bg-emerald-100 text-emerald-700" : score >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`pill ${c} tabular-nums`}>{score.toFixed(1)}</span>;
}

function statusClass(status: string) {
  switch (status) {
    case "ended":
      return "bg-ink-700/10 text-ink-500";
    case "in_progress":
      return "bg-brand-100 text-brand-700";
    case "ready":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-ink-700/10 text-ink-500";
  }
}
