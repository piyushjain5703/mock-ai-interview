import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, type EvaluationFeedback, type InterviewDetail } from "./api";
import { useAuth } from "./auth/AuthContext";

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 10;
  const offset = circumference * (1 - pct);
  const color = score >= 7 ? "#10b981" : score >= 5 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <svg width="96" height="96" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="6" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text
          x="44"
          y="44"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0b1020"
          fontSize="20"
          fontWeight="700"
        >
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">{label}</span>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between text-sm text-ink-700">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">{score.toFixed(1)}/10</span>
      </div>
      <div className="h-2 bg-ink-700/10 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function FeedbackView() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const interviewId = Number(id);

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [feedback, setFeedback] = useState<EvaluationFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeedback = useCallback(async () => {
    if (!token) return "error";
    try {
      const fb = await api.getFeedback(token, interviewId);
      setFeedback(fb);
      return fb.status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feedback");
      return "error";
    }
  }, [token, interviewId]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [iv, fb] = await Promise.all([
        api.getInterview(token, interviewId),
        api.getFeedback(token, interviewId),
      ]);
      setInterview(iv);
      setFeedback(fb);
      if (fb.status === "not_started") {
        await api.triggerEvaluation(token, interviewId);
        setFeedback((prev) => (prev ? { ...prev, status: "processing" } : prev));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token, interviewId]);

  useEffect(() => {
    void loadAll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!feedback) return;
    const isIncomplete = ["not_started", "pending", "processing"].includes(feedback.status);
    if (isIncomplete) {
      pollRef.current = setTimeout(async () => {
        const status = await loadFeedback();
        if (["not_started", "pending", "processing"].includes(status)) {
          pollRef.current = setTimeout(() => void loadFeedback(), 4000);
        }
      }, 3000);
    }
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [feedback?.status, loadFeedback]);

  if (loading) {
    return (
      <div className="surface-card p-10 grid place-items-center">
        <div className="spinner" />
        <p className="text-ink-500 mt-3 text-sm">Loading evaluation results...</p>
      </div>
    );
  }

  const isProcessing = feedback && ["not_started", "pending", "processing"].includes(feedback.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={() => navigate("/")} className="btn-ghost">
          <ArrowLeft size={16} /> Back
        </button>
        {interview && (
          <div>
            <h1 className="text-xl font-bold text-ink-900">Interview Results</h1>
            <span className="text-sm text-ink-500 capitalize">
              {interview.target_role} · {interview.interview_type.replace("_", " ")} · {interview.difficulty} ·{" "}
              {interview.duration_minutes} min
            </span>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {isProcessing && (
        <div className="surface-card p-6 flex items-center gap-4">
          <div className="spinner" />
          <div>
            <h3 className="font-semibold text-ink-900">Generating your evaluation...</h3>
            <p className="text-sm text-ink-500">Our AI is analyzing your interview transcript. This usually takes 15–30 seconds.</p>
          </div>
        </div>
      )}

      {feedback?.status === "failed" && (
        <div className="surface-card p-6">
          <h3 className="font-semibold text-red-700">Evaluation Failed</h3>
          <p className="text-sm text-red-600 mt-1">{feedback.error_message || "An unexpected error occurred."}</p>
          <button
            type="button"
            className="btn-primary mt-4"
            onClick={async () => {
              if (!token) return;
              setFeedback((prev) => (prev ? { ...prev, status: "processing" } : prev));
              await api.triggerEvaluation(token, interviewId);
            }}
          >
            Retry Evaluation
          </button>
        </div>
      )}

      {feedback?.status === "completed" && feedback.overall_score !== null && (
        <>
          <div className="surface-card p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <ScoreRing score={feedback.overall_score} label="Overall" />
            {feedback.category_scores && (
              <div className="flex-1 grid gap-3 w-full">
                <ScoreBar score={feedback.category_scores.technical_knowledge} label="Technical Knowledge" />
                <ScoreBar score={feedback.category_scores.communication} label="Communication" />
                <ScoreBar score={feedback.category_scores.problem_solving} label="Problem Solving" />
                <ScoreBar score={feedback.category_scores.confidence} label="Confidence" />
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <ListCard title="Strengths" titleClass="text-emerald-700" items={feedback.strengths} itemClass="bg-emerald-50 border-l-4 border-emerald-500" />
            <ListCard title="Areas for Improvement" titleClass="text-amber-700" items={feedback.weaknesses} itemClass="bg-amber-50 border-l-4 border-amber-500" />
          </div>

          {feedback.recommendations.length > 0 && (
            <ListCard
              title="Recommendations"
              titleClass="text-brand-700"
              items={feedback.recommendations}
              itemClass="bg-brand-50 border-l-4 border-brand-500"
            />
          )}

          {feedback.detailed_feedback && (
            <div className="surface-card p-5">
              <h3 className="font-semibold text-ink-900 mb-3">Detailed Feedback</h3>
              <div className="text-sm leading-relaxed text-ink-700 space-y-3">
                {feedback.detailed_feedback.split("\n").map((p, i) => (p.trim() ? <p key={i}>{p}</p> : null))}
              </div>
            </div>
          )}
        </>
      )}

      {interview && interview.turns.length > 0 && (
        <details className="surface-card p-5">
          <summary className="cursor-pointer font-semibold text-ink-700 hover:text-ink-900">
            View Full Transcript ({interview.turns.length} turns)
          </summary>
          <div className="max-h-[500px] overflow-y-auto flex flex-col gap-2 mt-4">
            {interview.turns.map((turn) => (
              <div
                key={turn.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  turn.role === "assistant"
                    ? "self-start bg-brand-50 rounded-bl-sm"
                    : "self-end bg-emerald-50 rounded-br-sm"
                }`}
              >
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-0.5">
                  {turn.role === "assistant" ? "Interviewer" : "You"}
                </span>
                <p>{turn.content}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ListCard({
  title,
  titleClass,
  items,
  itemClass,
}: {
  title: string;
  titleClass: string;
  items: string[];
  itemClass: string;
}) {
  return (
    <div className="surface-card p-5">
      <h3 className={`font-semibold mb-3 ${titleClass}`}>{title}</h3>
      <ul className="grid gap-2">
        {items.map((s, i) => (
          <li key={i} className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${itemClass}`}>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
