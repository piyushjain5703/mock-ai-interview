import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  api,
  type DashboardStats,
  type Interview,
  type InterviewConfig,
  type InterviewHistoryItem,
  type Profile,
  type Resume,
  type ResumeExtraction,
  type User,
} from "./api";
import FeedbackView from "./FeedbackView";
import InterviewSession from "./InterviewSession";

const TOKEN_KEY = "mock_ai_interview_token";

type View = "dashboard" | "interview-session" | "feedback";

function parseCsvInput(raw: string): string[] {
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function toCsv(items: string[]): string {
  return items.join(", ");
}

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

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [view, setView] = useState<View>("dashboard");
  const [activeInterviewId, setActiveInterviewId] = useState<number | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [history, setHistory] = useState<InterviewHistoryItem[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>({
    target_role: "",
    experience_level: "0-2",
    interview_type: "technical",
    difficulty: "medium",
    duration_minutes: 15,
  });

  const extractionDraft = useMemo<ResumeExtraction>(() => {
    return (
      resume?.extraction ?? {
        skills: [],
        projects: [],
        experience_summary: "",
      }
    );
  }, [resume]);

  const [skillsDraft, setSkillsDraft] = useState("");
  const [projectsDraft, setProjectsDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");

  useEffect(() => {
    if (!token) {
      setUser(null);
      setProfile(null);
      setResume(null);
      setInterviews([]);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
    void loadInitial(token);
  }, [token]);

  useEffect(() => {
    setSkillsDraft(toCsv(extractionDraft.skills));
    setProjectsDraft(toCsv(extractionDraft.projects));
    setSummaryDraft(extractionDraft.experience_summary ?? "");
  }, [extractionDraft]);

  async function loadInitial(activeToken: string) {
    try {
      const [me, profileData, interviewList] = await Promise.all([
        api.me(activeToken),
        api.getProfile(activeToken),
        api.listInterviews(activeToken),
      ]);
      setUser(me);
      setProfile(profileData);
      setInterviews(interviewList);
      void loadDashboardData(activeToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
      handleLogout();
    }
  }

  async function loadDashboardData(activeToken: string) {
    try {
      const [historyData, statsData] = await Promise.all([
        api.getHistory(activeToken, { limit: 50 }),
        api.getDashboardStats(activeToken),
      ]);
      setHistory(historyData);
      setStats(statsData);
    } catch {
      // stats are non-critical
    }
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const response = authMode === "signup" ? await api.signup(email, password) : await api.login(email, password);
      setToken(response.access_token);
      setMessage(`Authentication successful via ${authMode}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleProfileSave(event: FormEvent) {
    event.preventDefault();
    if (!token || !profile) return;

    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const updated = await api.updateProfile(token, {
        full_name: profile.full_name,
        experience_level: profile.experience_level,
        preferred_roles: profile.preferred_roles,
      });
      setProfile(updated);
      setMessage("Profile updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setLoading(false);
    }
  }

  async function handleResumeUpload(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedFile) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const uploaded = await api.uploadResume(token, selectedFile);
      setResume(uploaded);
      setMessage("Resume uploaded. Parsing in background...");
      setTimeout(() => {
        void refreshResume(uploaded.id);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function refreshResume(resumeId?: number) {
    if (!token) return;
    if (!resumeId && !resume) return;
    const id = resumeId ?? resume?.id;
    if (!id) return;
    try {
      const latest = await api.getResume(token, id);
      setResume(latest);
      if (latest.parse_status !== "completed") {
        setTimeout(() => {
          void refreshResume(id);
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh resume");
    }
  }

  async function handleExtractionSave(event: FormEvent) {
    event.preventDefault();
    if (!token || !resume) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const updated = await api.updateResumeExtraction(token, resume.id, {
        skills: parseCsvInput(skillsDraft),
        projects: parseCsvInput(projectsDraft),
        experience_summary: summaryDraft,
      });
      setResume(updated);
      setMessage("Extraction updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update extraction");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateInterview(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const config = { ...interviewConfig };
      if (resume) {
        config.resume_id = resume.id;
      }
      const created = await api.createInterview(token, config);
      setInterviews((prev) => [created, ...prev]);
      setActiveInterviewId(created.id);
      setView("interview-session");
      setMessage("Interview created! Click Start to begin.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create interview");
    } finally {
      setLoading(false);
    }
  }

  function openInterview(id: number) {
    const iv = interviews.find((i) => i.id === id);
    setActiveInterviewId(id);
    if (iv && iv.status === "ended") {
      setView("feedback");
    } else {
      setView("interview-session");
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setEmail("");
    setPassword("");
    setUser(null);
    setProfile(null);
    setResume(null);
    setInterviews([]);
    setView("dashboard");
  }

  if (view === "feedback" && token && activeInterviewId) {
    return (
      <main className="container">
        <FeedbackView
          token={token}
          interviewId={activeInterviewId}
          onBack={() => {
            setView("dashboard");
            if (token) {
              void api.listInterviews(token).then(setInterviews);
              void loadDashboardData(token);
            }
          }}
        />
      </main>
    );
  }

  if (view === "interview-session" && token && activeInterviewId) {
    return (
      <main className="container">
        <InterviewSession
          token={token}
          interviewId={activeInterviewId}
          onBack={() => {
            setView("dashboard");
            if (token) {
              void api.listInterviews(token).then(setInterviews);
              void loadDashboardData(token);
            }
          }}
          onViewResults={() => {
            setView("feedback");
          }}
        />
      </main>
    );
  }

  return (
    <main className="container">
      <h1>Mock AI Interview</h1>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {!token ? (
        <section className="card">
          <h2>{authMode === "signup" ? "Create account" : "Login"}</h2>
          <form onSubmit={handleAuthSubmit} className="stack">
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </label>
            <label>
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required />
            </label>
            <button disabled={loading} type="submit">
              {loading ? "Please wait..." : authMode === "signup" ? "Sign up" : "Login"}
            </button>
          </form>
          <button
            className="ghost"
            type="button"
            onClick={() => setAuthMode((prev) => (prev === "signup" ? "login" : "signup"))}
          >
            Switch to {authMode === "signup" ? "login" : "signup"}
          </button>
        </section>
      ) : (
        <>
          <section className="card row-between">
            <div>
              <h2>Welcome back</h2>
              <p>{user?.email ?? "Loading user..."}</p>
            </div>
            <button type="button" className="ghost" onClick={handleLogout}>
              Logout
            </button>
          </section>

          {profile && (
            <section className="card">
              <h2>Profile</h2>
              <form className="stack" onSubmit={handleProfileSave}>
                <label>
                  Full name
                  <input
                    value={profile.full_name ?? ""}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    type="text"
                  />
                </label>
                <label>
                  Experience level
                  <input
                    value={profile.experience_level ?? ""}
                    onChange={(e) => setProfile({ ...profile, experience_level: e.target.value })}
                    type="text"
                    placeholder="0-2 / 3-5 / 5+"
                  />
                </label>
                <label>
                  Preferred roles (comma-separated)
                  <input
                    value={toCsv(profile.preferred_roles)}
                    onChange={(e) => setProfile({ ...profile, preferred_roles: parseCsvInput(e.target.value) })}
                    type="text"
                  />
                </label>
                <button disabled={loading} type="submit">
                  Save profile
                </button>
              </form>
            </section>
          )}

          <section className="card">
            <h2>Resume upload + parsing</h2>
            <form className="stack" onSubmit={handleResumeUpload}>
              <input
                type="file"
                accept=".txt,.pdf,.doc,.docx"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                required
              />
              <button type="submit" disabled={loading || !selectedFile}>
                Upload resume
              </button>
            </form>

            {resume && (
              <div className="stack">
                <p>
                  Latest resume: <strong>{resume.filename}</strong> ({resume.parse_status})
                </p>
                <button className="ghost" type="button" onClick={() => void refreshResume()}>
                  Refresh parse status
                </button>
              </div>
            )}
          </section>

          {resume?.extraction && (
            <section className="card">
              <h2>Extracted profile (editable)</h2>
              <form className="stack" onSubmit={handleExtractionSave}>
                <label>
                  Skills (comma-separated)
                  <input value={skillsDraft} onChange={(e) => setSkillsDraft(e.target.value)} type="text" />
                </label>
                <label>
                  Projects (comma-separated)
                  <input value={projectsDraft} onChange={(e) => setProjectsDraft(e.target.value)} type="text" />
                </label>
                <label>
                  Experience summary
                  <textarea value={summaryDraft} onChange={(e) => setSummaryDraft(e.target.value)} rows={4} />
                </label>
                <button type="submit" disabled={loading}>
                  Save extraction
                </button>
              </form>
            </section>
          )}

          <section className="card">
            <h2>Configure Interview</h2>
            <form className="stack" onSubmit={handleCreateInterview}>
              <label>
                Target role
                <input
                  value={interviewConfig.target_role}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, target_role: e.target.value })}
                  type="text"
                  placeholder="e.g. Backend Engineer"
                  required
                />
              </label>
              <label>
                Experience level
                <select
                  value={interviewConfig.experience_level}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, experience_level: e.target.value })}
                >
                  <option value="0-2">0-2 years</option>
                  <option value="3-5">3-5 years</option>
                  <option value="5+">5+ years</option>
                </select>
              </label>
              <label>
                Interview type
                <select
                  value={interviewConfig.interview_type}
                  onChange={(e) =>
                    setInterviewConfig({
                      ...interviewConfig,
                      interview_type: e.target.value as InterviewConfig["interview_type"],
                    })
                  }
                >
                  {INTERVIEW_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty
                <select
                  value={interviewConfig.difficulty}
                  onChange={(e) =>
                    setInterviewConfig({
                      ...interviewConfig,
                      difficulty: e.target.value as InterviewConfig["difficulty"],
                    })
                  }
                >
                  {DIFFICULTY_LEVELS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Duration
                <select
                  value={interviewConfig.duration_minutes}
                  onChange={(e) =>
                    setInterviewConfig({ ...interviewConfig, duration_minutes: Number(e.target.value) })
                  }
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} minutes
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Company style (optional)
                <input
                  value={interviewConfig.company_style ?? ""}
                  onChange={(e) =>
                    setInterviewConfig({
                      ...interviewConfig,
                      company_style: e.target.value || undefined,
                    })
                  }
                  type="text"
                  placeholder="e.g. Google, Amazon"
                />
              </label>
              <button type="submit" disabled={loading || !interviewConfig.target_role}>
                {loading ? "Creating..." : "Start New Interview"}
              </button>
            </form>
          </section>

          {stats && stats.total_interviews > 0 && (
            <section className="card">
              <h2>Your Progress</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-value">{stats.total_interviews}</span>
                  <span className="stat-label">Total Interviews</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.completed_interviews}</span>
                  <span className="stat-label">Completed</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.average_score?.toFixed(1) ?? "—"}</span>
                  <span className="stat-label">Avg Score</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.best_score?.toFixed(1) ?? "—"}</span>
                  <span className="stat-label">Best Score</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.total_practice_minutes}</span>
                  <span className="stat-label">Practice (min)</span>
                </div>
              </div>

              {stats.score_trend.length >= 2 && (
                <div className="trend-section">
                  <h3>Score Trend</h3>
                  <div className="trend-chart">
                    <svg viewBox={`0 0 ${Math.max(stats.score_trend.length * 60, 200)} 120`} className="trend-svg">
                      {(() => {
                        const pts = stats.score_trend;
                        const w = Math.max(pts.length * 60, 200);
                        const xStep = (w - 40) / Math.max(pts.length - 1, 1);
                        const points = pts.map((p, i) => ({
                          x: 20 + i * xStep,
                          y: 110 - (p.score / 10) * 100,
                        }));
                        const line = points.map((p) => `${p.x},${p.y}`).join(" ");
                        return (
                          <>
                            <line x1="20" y1="10" x2="20" y2="110" stroke="#2a324f" strokeWidth="1" />
                            <line x1="20" y1="110" x2={w - 20} y2="110" stroke="#2a324f" strokeWidth="1" />
                            <polyline fill="none" stroke="#3f67ff" strokeWidth="2" points={line} />
                            {points.map((p, i) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r="4" fill="#3f67ff" />
                                <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#7c8db5" fontSize="10">
                                  {pts[i].score}
                                </text>
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}

              {Object.keys(stats.type_breakdown).length > 0 && (
                <div className="type-breakdown">
                  <h3>By Type</h3>
                  <div className="type-tags">
                    {Object.entries(stats.type_breakdown).map(([type, count]) => (
                      <span key={type} className="type-tag">
                        {type.replace("_", " ")} <strong>{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {(history.length > 0 || interviews.length > 0) && (
            <section className="card">
              <h2>Interview History</h2>
              <div className="interview-list">
                {(history.length > 0 ? history : interviews).map((iv) => (
                  <div key={iv.id} className="interview-item" onClick={() => openInterview(iv.id)}>
                    <div className="interview-item-info">
                      <strong>{iv.target_role}</strong>
                      <span className="interview-item-meta">
                        {iv.interview_type.replace("_", " ")} &middot; {iv.difficulty} &middot; {iv.duration_minutes} min
                      </span>
                    </div>
                    <div className="interview-item-right">
                      {"overall_score" in iv && iv.overall_score != null && (
                        <span className={`score-pill ${iv.overall_score >= 7 ? "score-good" : iv.overall_score >= 5 ? "score-ok" : "score-low"}`}>
                          {iv.overall_score.toFixed(1)}
                        </span>
                      )}
                      <span className={`status-badge status-${iv.status}`}>{iv.status}</span>
                      <span className="interview-item-date">
                        {new Date(iv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
