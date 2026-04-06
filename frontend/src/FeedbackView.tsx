import { useCallback, useEffect, useRef, useState } from "react";

import { api, type EvaluationFeedback, type InterviewDetail } from "./api";

type Props = {
  token: string;
  interviewId: number;
  onBack: () => void;
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const pct = score / 10;
  const offset = circumference * (1 - pct);
  const color = score >= 7 ? "#22c55e" : score >= 5 ? "#f0c040" : "#ef4444";

  return (
    <div className="score-ring-wrapper">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#1a2440" strokeWidth="6" />
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
        <text x="44" y="44" textAnchor="middle" dominantBaseline="central" fill="#f7f8fb" fontSize="20" fontWeight="700">
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="score-ring-label">{label}</span>
    </div>
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = (score / 10) * 100;
  const color = score >= 7 ? "#22c55e" : score >= 5 ? "#f0c040" : "#ef4444";

  return (
    <div className="score-bar">
      <div className="score-bar-header">
        <span>{label}</span>
        <span className="score-bar-value">{score.toFixed(1)}/10</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function FeedbackView({ token, interviewId, onBack }: Props) {
  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [feedback, setFeedback] = useState<EvaluationFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFeedback = useCallback(async () => {
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
      <div className="feedback-view">
        <div className="feedback-loading">
          <div className="spinner" />
          <p>Loading evaluation results...</p>
        </div>
      </div>
    );
  }

  const isProcessing = feedback && ["not_started", "pending", "processing"].includes(feedback.status);

  return (
    <div className="feedback-view">
      <div className="feedback-header">
        <button className="ghost" type="button" onClick={onBack}>
          &larr; Back to Dashboard
        </button>
        {interview && (
          <div className="feedback-meta">
            <h2>Interview Results</h2>
            <span className="feedback-meta-details">
              {interview.target_role} &middot; {interview.interview_type.toUpperCase()} &middot;{" "}
              {interview.difficulty} &middot; {interview.duration_minutes} min
            </span>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {isProcessing && (
        <div className="feedback-processing card">
          <div className="spinner" />
          <div>
            <h3>Generating your evaluation...</h3>
            <p>Our AI is analyzing your interview transcript. This usually takes 15-30 seconds.</p>
          </div>
        </div>
      )}

      {feedback?.status === "failed" && (
        <div className="card">
          <h3>Evaluation Failed</h3>
          <p className="error">{feedback.error_message || "An unexpected error occurred."}</p>
          <button
            type="button"
            onClick={async () => {
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
          <div className="scores-overview card">
            <ScoreRing score={feedback.overall_score} label="Overall" />

            {feedback.category_scores && (
              <div className="category-scores">
                <ScoreBar score={feedback.category_scores.technical_knowledge} label="Technical Knowledge" />
                <ScoreBar score={feedback.category_scores.communication} label="Communication" />
                <ScoreBar score={feedback.category_scores.problem_solving} label="Problem Solving" />
                <ScoreBar score={feedback.category_scores.confidence} label="Confidence" />
              </div>
            )}
          </div>

          <div className="feedback-columns">
            <div className="card feedback-list-card">
              <h3 className="feedback-list-title strengths-title">Strengths</h3>
              <ul className="feedback-list">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="feedback-list-item strength-item">{s}</li>
                ))}
              </ul>
            </div>
            <div className="card feedback-list-card">
              <h3 className="feedback-list-title weaknesses-title">Areas for Improvement</h3>
              <ul className="feedback-list">
                {feedback.weaknesses.map((w, i) => (
                  <li key={i} className="feedback-list-item weakness-item">{w}</li>
                ))}
              </ul>
            </div>
          </div>

          {feedback.recommendations.length > 0 && (
            <div className="card">
              <h3 className="feedback-list-title recommendations-title">Recommendations</h3>
              <ul className="feedback-list">
                {feedback.recommendations.map((r, i) => (
                  <li key={i} className="feedback-list-item recommendation-item">{r}</li>
                ))}
              </ul>
            </div>
          )}

          {feedback.detailed_feedback && (
            <div className="card">
              <h3>Detailed Feedback</h3>
              <div className="detailed-feedback">
                {feedback.detailed_feedback.split("\n").map((paragraph, i) =>
                  paragraph.trim() ? <p key={i}>{paragraph}</p> : null
                )}
              </div>
            </div>
          )}
        </>
      )}

      {interview && interview.turns.length > 0 && (
        <details className="card transcript-details">
          <summary>View Full Transcript ({interview.turns.length} turns)</summary>
          <div className="transcript-feed" style={{ maxHeight: "500px" }}>
            {interview.turns.map((turn) => (
              <div key={turn.id} className={`turn turn-${turn.role}`}>
                <span className="turn-role">{turn.role === "assistant" ? "Interviewer" : "You"}</span>
                <p className="turn-content">{turn.content}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
