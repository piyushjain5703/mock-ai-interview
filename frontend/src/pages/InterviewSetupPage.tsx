import { Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { api, type InterviewConfig, type Resume } from "../api";
import { useAuth } from "../auth/AuthContext";

const INTERVIEW_TYPES = [
  { value: "hr", label: "HR / Behavioral" },
  { value: "technical", label: "Technical" },
  { value: "dsa", label: "DSA" },
  { value: "system_design", label: "System Design" },
] as const;

const DIFFICULTY_LEVELS = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

const DURATION_OPTIONS = [15, 30, 45, 60];

export default function InterviewSetupPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<InterviewConfig>({
    target_role: "",
    experience_level: "0-2",
    interview_type: "technical",
    difficulty: "medium",
    duration_minutes: 15,
  });

  useEffect(() => {
    // Resume is optional. We skip preloading; backend can attach via Profile if linked.
    setResume(null);
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const payload: InterviewConfig = { ...config };
      if (resume) payload.resume_id = resume.id;
      const created = await api.createInterview(token, payload);
      navigate(`/interview/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create interview");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">New Interview</h1>
        <p className="text-ink-500 text-sm mt-1">Configure the role, type, and difficulty. We'll spin up the AI interviewer.</p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <form onSubmit={handleSubmit} className="surface-card p-5 sm:p-6 grid gap-4 sm:grid-cols-2">
        <Field label="Target role" className="sm:col-span-2">
          <input
            value={config.target_role}
            onChange={(e) => setConfig({ ...config, target_role: e.target.value })}
            placeholder="e.g. Backend Engineer"
            required
            className="text-input-plain"
          />
        </Field>

        <Field label="Experience level">
          <select
            value={config.experience_level}
            onChange={(e) => setConfig({ ...config, experience_level: e.target.value })}
            className="text-input-plain"
          >
            <option value="0-2">0–2 years</option>
            <option value="3-5">3–5 years</option>
            <option value="5+">5+ years</option>
          </select>
        </Field>

        <Field label="Interview type">
          <select
            value={config.interview_type}
            onChange={(e) =>
              setConfig({ ...config, interview_type: e.target.value as InterviewConfig["interview_type"] })
            }
            className="text-input-plain"
          >
            {INTERVIEW_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Difficulty">
          <select
            value={config.difficulty}
            onChange={(e) =>
              setConfig({ ...config, difficulty: e.target.value as InterviewConfig["difficulty"] })
            }
            className="text-input-plain"
          >
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Duration">
          <select
            value={config.duration_minutes}
            onChange={(e) => setConfig({ ...config, duration_minutes: Number(e.target.value) })}
            className="text-input-plain"
          >
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </Field>

        <Field label="Company style (optional)" className="sm:col-span-2">
          <input
            value={config.company_style ?? ""}
            onChange={(e) => setConfig({ ...config, company_style: e.target.value || undefined })}
            placeholder="e.g. Google, Amazon"
            className="text-input-plain"
          />
        </Field>

        <div className="sm:col-span-2">
          <button type="submit" disabled={loading || !config.target_role.trim()} className="btn-primary w-full sm:w-auto">
            <Sparkles size={16} />
            {loading ? "Creating..." : "Start New Interview"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1.5 text-sm text-ink-700 ${className}`}>
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
