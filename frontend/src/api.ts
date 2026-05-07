const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  token?: string | null;
  body?: unknown;
  isFormData?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!options.isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body
      ? options.isFormData
        ? (options.body as FormData)
        : JSON.stringify(options.body)
      : undefined,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = (await response.json()) as { detail?: string };
      message = data.detail ?? message;
    } catch {
      message = `${response.status} ${response.statusText}`;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export type TokenResponse = { access_token: string; token_type: string };
export type User = {
  id: number;
  email: string;
  full_name?: string | null;
  picture_url?: string | null;
  oauth_provider?: string | null;
};
export type Profile = {
  full_name: string | null;
  experience_level: string | null;
  preferred_roles: string[];
  user_id: number;
};
export type ResumeExtraction = {
  skills: string[];
  projects: string[];
  experience_summary: string | null;
};
export type Resume = {
  id: number;
  filename: string;
  parse_status: string;
  created_at: string;
  extraction: ResumeExtraction | null;
};

export type InterviewConfig = {
  target_role: string;
  experience_level: string;
  interview_type: "hr" | "technical" | "dsa" | "system_design";
  difficulty: "easy" | "medium" | "hard";
  duration_minutes: number;
  resume_id?: number;
  company_style?: string;
};

export type ConversationTurn = {
  id: number;
  role: string;
  content: string;
  timestamp: string;
};

export type ClientTranscriptTurn = {
  role: string;
  content: string;
};

export type Interview = {
  id: number;
  target_role: string;
  experience_level: string;
  interview_type: string;
  difficulty: string;
  duration_minutes: number;
  company_style: string | null;
  status: string;
  vapi_call_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  recording_url: string | null;
  summary: string | null;
};

export type InterviewDetail = Interview & {
  turns: ConversationTurn[];
};

export type InterviewStartResult = {
  interview_id: number;
  assistant_config: Record<string, unknown>;
  vapi_call_id: string | null;
};

export type CategoryScores = {
  technical_knowledge: number;
  communication: number;
  problem_solving: number;
  confidence: number;
};

export type InterviewHistoryItem = {
  id: number;
  target_role: string;
  experience_level: string;
  interview_type: string;
  difficulty: string;
  duration_minutes: number;
  company_style: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  duration_seconds: number | null;
  overall_score: number | null;
  evaluation_status: string | null;
};

export type ScoreTrendPoint = {
  interview_id: number;
  date: string;
  score: number;
};

export type DashboardStats = {
  total_interviews: number;
  completed_interviews: number;
  average_score: number | null;
  best_score: number | null;
  total_practice_minutes: number;
  score_trend: ScoreTrendPoint[];
  type_breakdown: Record<string, number>;
};

export type EvaluationFeedback = {
  id?: number;
  session_id: number;
  status: string;
  overall_score: number | null;
  category_scores: CategoryScores | null;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  detailed_feedback: string | null;
  error_message: string | null;
  created_at?: string;
  completed_at?: string;
};

export const api = {
  baseUrl: API_BASE_URL,
  signup(email: string, password: string) {
    return request<TokenResponse>("/auth/signup", { method: "POST", body: { email, password } });
  },
  login(email: string, password: string) {
    return request<TokenResponse>("/auth/login", { method: "POST", body: { email, password } });
  },
  googleAuth(idToken: string) {
    return request<TokenResponse>("/auth/google", { method: "POST", body: { id_token: idToken } });
  },
  appleAuth(idToken: string, fullName?: string) {
    return request<TokenResponse>("/auth/apple", {
      method: "POST",
      body: { id_token: idToken, full_name: fullName },
    });
  },
  me(token: string) {
    return request<User>("/auth/me", { token });
  },
  getProfile(token: string) {
    return request<Profile>("/profile", { token });
  },
  updateProfile(token: string, payload: Omit<Profile, "user_id">) {
    return request<Profile>("/profile", { method: "PUT", token, body: payload });
  },
  uploadResume(token: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<Resume>("/resumes", { method: "POST", token, body: form, isFormData: true });
  },
  getResume(token: string, resumeId: number) {
    return request<Resume>(`/resumes/${resumeId}`, { token });
  },
  updateResumeExtraction(token: string, resumeId: number, extraction: ResumeExtraction) {
    return request<Resume>(`/resumes/${resumeId}/extraction`, {
      method: "PATCH",
      token,
      body: extraction,
    });
  },

  createInterview(token: string, config: InterviewConfig) {
    return request<Interview>("/interviews", { method: "POST", token, body: config });
  },
  listInterviews(token: string) {
    return request<Interview[]>("/interviews", { token });
  },
  getInterview(token: string, interviewId: number) {
    return request<InterviewDetail>(`/interviews/${interviewId}`, { token });
  },
  startInterview(token: string, interviewId: number) {
    return request<InterviewStartResult>(`/interviews/${interviewId}/start`, { method: "POST", token });
  },
  syncClientTranscript(token: string, interviewId: number, turns: ClientTranscriptTurn[]) {
    return request<InterviewDetail>(`/interviews/${interviewId}/client-transcript`, {
      method: "POST",
      token,
      body: { turns },
    });
  },
  endInterview(token: string, interviewId: number) {
    return request<Interview>(`/interviews/${interviewId}/end`, { method: "POST", token });
  },
  getFeedback(token: string, interviewId: number) {
    return request<EvaluationFeedback>(`/interviews/${interviewId}/feedback`, { token });
  },
  triggerEvaluation(token: string, interviewId: number) {
    return request<EvaluationFeedback>(`/interviews/${interviewId}/evaluate`, { method: "POST", token });
  },
  getHistory(token: string, params?: { limit?: number; offset?: number; interview_type?: string }) {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.offset) q.set("offset", String(params.offset));
    if (params?.interview_type) q.set("interview_type", params.interview_type);
    const qs = q.toString();
    return request<InterviewHistoryItem[]>(`/history${qs ? `?${qs}` : ""}`, { token });
  },
  getDashboardStats(token: string) {
    return request<DashboardStats>("/history/stats", { token });
  },
};
