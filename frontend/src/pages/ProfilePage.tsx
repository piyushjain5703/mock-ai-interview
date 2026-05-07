import { FileUp, Save } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { api, type Profile, type Resume } from "../api";
import { useAuth } from "../auth/AuthContext";

function parseCsv(raw: string): string[] {
  return raw.split(",").map((x) => x.trim()).filter(Boolean);
}
function toCsv(items: string[]): string {
  return items.join(", ");
}

export default function ProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const extraction = useMemo(
    () => resume?.extraction ?? { skills: [], projects: [], experience_summary: "" },
    [resume],
  );
  const [skillsDraft, setSkillsDraft] = useState("");
  const [projectsDraft, setProjectsDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState("");

  useEffect(() => {
    if (!token) return;
    api.getProfile(token).then(setProfile).catch((err) => setError(String(err.message ?? err)));
  }, [token]);

  useEffect(() => {
    setSkillsDraft(toCsv(extraction.skills));
    setProjectsDraft(toCsv(extraction.projects));
    setSummaryDraft(extraction.experience_summary ?? "");
  }, [extraction]);

  async function handleProfileSave(event: FormEvent) {
    event.preventDefault();
    if (!token || !profile) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateProfile(token, {
        full_name: profile.full_name,
        experience_level: profile.experience_level,
        preferred_roles: profile.preferred_roles,
      });
      setProfile(updated);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setLoading(false);
    }
  }

  async function refreshResume(resumeId?: number) {
    if (!token) return;
    const id = resumeId ?? resume?.id;
    if (!id) return;
    try {
      const latest = await api.getResume(token, id);
      setResume(latest);
      if (latest.parse_status !== "completed") {
        setTimeout(() => void refreshResume(id), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh resume");
    }
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    if (!token || !selectedFile) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const uploaded = await api.uploadResume(token, selectedFile);
      setResume(uploaded);
      setMessage("Resume uploaded. Parsing in background...");
      setTimeout(() => void refreshResume(uploaded.id), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleExtractionSave(event: FormEvent) {
    event.preventDefault();
    if (!token || !resume) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.updateResumeExtraction(token, resume.id, {
        skills: parseCsv(skillsDraft),
        projects: parseCsv(projectsDraft),
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

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-ink-900">Profile & Resume</h1>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {message && <p className="text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{message}</p>}

      {profile && (
        <section className="surface-card p-5 sm:p-6">
          <h2 className="font-semibold text-ink-900 mb-4">Personal info</h2>
          <form onSubmit={handleProfileSave} className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                value={profile.full_name ?? ""}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                className="text-input-plain"
              />
            </Field>
            <Field label="Experience level">
              <select
                value={profile.experience_level ?? "0-2"}
                onChange={(e) => setProfile({ ...profile, experience_level: e.target.value })}
                className="text-input-plain"
              >
                <option value="0-2">0–2 years</option>
                <option value="3-5">3–5 years</option>
                <option value="5+">5+ years</option>
              </select>
            </Field>
            <Field label="Preferred roles (comma-separated)" className="sm:col-span-2">
              <input
                value={toCsv(profile.preferred_roles)}
                onChange={(e) => setProfile({ ...profile, preferred_roles: parseCsv(e.target.value) })}
                className="text-input-plain"
                placeholder="Backend Engineer, Data Engineer"
              />
            </Field>
            <div className="sm:col-span-2">
              <button type="submit" disabled={loading} className="btn-primary">
                <Save size={16} /> Save profile
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="surface-card p-5 sm:p-6">
        <h2 className="font-semibold text-ink-900 mb-4">Resume</h2>
        <form onSubmit={handleUpload} className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            type="file"
            accept=".txt,.pdf,.doc,.docx"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            className="block text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-900 file:text-white file:px-3 file:py-2 file:cursor-pointer"
          />
          <button type="submit" disabled={loading || !selectedFile} className="btn-brand">
            <FileUp size={16} /> Upload
          </button>
        </form>

        {resume && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-2 border border-ink-600/10">
            <span className="text-sm text-ink-700 truncate">
              <strong>{resume.filename}</strong>{" "}
              <span className="text-ink-500">({resume.parse_status})</span>
            </span>
            <button type="button" className="btn-ghost text-sm" onClick={() => void refreshResume()}>
              Refresh
            </button>
          </div>
        )}
      </section>

      {resume?.extraction && (
        <section className="surface-card p-5 sm:p-6">
          <h2 className="font-semibold text-ink-900 mb-4">Extracted profile (editable)</h2>
          <form onSubmit={handleExtractionSave} className="grid gap-4">
            <Field label="Skills (comma-separated)">
              <input
                value={skillsDraft}
                onChange={(e) => setSkillsDraft(e.target.value)}
                className="text-input-plain"
              />
            </Field>
            <Field label="Projects (comma-separated)">
              <input
                value={projectsDraft}
                onChange={(e) => setProjectsDraft(e.target.value)}
                className="text-input-plain"
              />
            </Field>
            <Field label="Experience summary">
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                rows={4}
                className="text-input-plain"
              />
            </Field>
            <div>
              <button type="submit" disabled={loading} className="btn-primary">
                <Save size={16} /> Save extraction
              </button>
            </div>
          </form>
        </section>
      )}
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
