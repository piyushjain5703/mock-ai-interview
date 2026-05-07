import { ArrowRight, FileText, History as HistoryIcon, Sparkles, TrendingUp, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  api,
  type DashboardStats,
  type InterviewHistoryItem,
} from "../api";
import { useAuth } from "../auth/AuthContext";

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.getDashboardStats(token).catch(() => null),
      api.getHistory(token, { limit: 5 }).catch(() => []),
    ]).then(([s, h]) => {
      setStats(s);
      setHistory(h ?? []);
    });
  }, [token]);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  const displayName = user?.full_name || user?.email?.split("@")[0] || "there";

  return (
    <div className="space-y-6">
      <section className="surface-card p-6 sm:p-8 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-500 text-sm">{greeting},</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-900 mt-1">{displayName} 👋</h1>
          <p className="text-ink-500 mt-2 max-w-lg">
            Sharpen your interview skills with an AI coach. Run a mock, get scored, and review feedback in minutes.
          </p>
        </div>
        <Link to="/interview/new" className="btn-primary">
          <Sparkles size={16} />
          Start New Interview
        </Link>
      </section>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <QuickActionCard
          to="/interview/new"
          icon={<Sparkles size={20} />}
          title="New Interview"
          desc="Configure role, type, and difficulty."
          accent="bg-brand-500"
        />
        <QuickActionCard
          to="/profile"
          icon={<FileText size={20} />}
          title="Upload Resume"
          desc="Tailor questions to your background."
          accent="bg-emerald-500"
        />
        <QuickActionCard
          to="/history"
          icon={<HistoryIcon size={20} />}
          title="View History"
          desc="Replay past interviews & feedback."
          accent="bg-amber-500"
        />
      </section>

      {stats && stats.total_interviews > 0 && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatTile label="Total" value={stats.total_interviews} />
            <StatTile label="Completed" value={stats.completed_interviews} />
            <StatTile label="Avg Score" value={stats.average_score?.toFixed(1) ?? "—"} />
            <StatTile label="Best" value={stats.best_score?.toFixed(1) ?? "—"} icon={<Trophy size={14} />} />
            <StatTile label="Practice (min)" value={stats.total_practice_minutes} />
          </section>

          {stats.score_trend.length >= 2 && (
            <section className="surface-card p-5">
              <div className="flex items-center gap-2 mb-3 text-ink-500">
                <TrendingUp size={16} />
                <h2 className="font-semibold text-ink-900">Score Trend</h2>
              </div>
              <TrendChart trend={stats.score_trend} />
            </section>
          )}
        </>
      )}

      {history.length > 0 ? (
        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-ink-900">Recent Interviews</h2>
            <Link to="/history" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <ul className="divide-y divide-ink-600/10">
            {history.slice(0, 5).map((iv) => (
              <li key={iv.id}>
                <Link
                  to={iv.status === "ended" ? `/interview/${iv.id}/feedback` : `/interview/${iv.id}`}
                  className="flex items-center justify-between gap-3 py-3 px-1 hover:bg-white/40 rounded-lg transition"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900 truncate">{iv.target_role}</p>
                    <p className="text-xs text-ink-500 capitalize">
                      {iv.interview_type.replace("_", " ")} · {iv.difficulty} · {iv.duration_minutes} min
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {iv.overall_score != null && (
                      <ScorePill score={iv.overall_score} />
                    )}
                    <span className={`pill ${statusClass(iv.status)} capitalize`}>{iv.status.replace("_", " ")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="surface-card p-8 text-center">
          <p className="text-ink-500">No interviews yet. Start your first one!</p>
          <Link to="/interview/new" className="btn-brand mt-4 inline-flex">
            <Sparkles size={16} />
            Start your first interview
          </Link>
        </section>
      )}
    </div>
  );
}

function QuickActionCard({
  to,
  icon,
  title,
  desc,
  accent,
}: {
  to: string;
  icon: JSX.Element;
  title: string;
  desc: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="surface-card p-5 hover:shadow-md hover:-translate-y-0.5 transition flex items-start gap-3"
    >
      <div className={`w-10 h-10 rounded-xl ${accent} text-white grid place-items-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-ink-900">{title}</p>
        <p className="text-sm text-ink-500 mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}

function StatTile({ label, value, icon }: { label: string; value: number | string; icon?: JSX.Element }) {
  return (
    <div className="stat-tile">
      <div className="text-xs text-ink-500 uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold text-ink-900 tabular-nums">{value}</div>
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

function TrendChart({ trend }: { trend: { score: number }[] }) {
  const w = Math.max(trend.length * 60, 200);
  const xStep = (w - 40) / Math.max(trend.length - 1, 1);
  const points = trend.map((p, i) => ({
    x: 20 + i * xStep,
    y: 110 - (p.score / 10) * 100,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} 130`} className="w-full max-h-40">
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3f67ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3f67ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="20" y1="10" x2="20" y2="110" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="20" y1="110" x2={w - 20} y2="110" stroke="#cbd5e1" strokeWidth="1" />
        <polyline
          fill="url(#trendFill)"
          stroke="none"
          points={`20,110 ${line} ${w - 20},110`}
        />
        <polyline fill="none" stroke="#3f67ff" strokeWidth="2.5" points={line} />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="white" stroke="#3f67ff" strokeWidth="2" />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fill="#4a5583" fontSize="10">
              {trend[i].score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
