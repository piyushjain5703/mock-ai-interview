import { ArrowLeft, Mic, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { api, type ConversationTurn, type InterviewDetail, type InterviewStartResult } from "./api";
import { useAuth } from "./auth/AuthContext";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY ?? "";

type CallStatus = "idle" | "connecting" | "connected" | "speaking" | "listening" | "ended" | "error";

export default function InterviewSession() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const interviewId = Number(id);

  const [interview, setInterview] = useState<InterviewDetail | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [transcript, setTranscript] = useState<ConversationTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vapiRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<ConversationTurn[]>([]);
  const finalizedRef = useRef(false);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const loadInterview = useCallback(async () => {
    if (!token || !interviewId) return;
    try {
      const data = await api.getInterview(token, interviewId);
      setInterview(data);
      if (data.turns.length > 0) setTranscript(data.turns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interview");
    }
  }, [token, interviewId]);

  useEffect(() => {
    void loadInterview();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (vapiRef.current) {
        try {
          vapiRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, [loadInterview]);

  const finalizeInterview = useCallback(async () => {
    if (finalizedRef.current || !token) return;
    finalizedRef.current = true;
    try {
      const rows = transcriptRef.current.filter((t) => t.content.trim());
      if (rows.length > 0) {
        await api.syncClientTranscript(
          token,
          interviewId,
          rows.map((t) => ({ role: t.role, content: t.content })),
        );
      }
      await api.endInterview(token, interviewId);
      await loadInterview();
    } catch (err) {
      finalizedRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to end interview");
    }
  }, [token, interviewId, loadInterview]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  function startTimer() {
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => setElapsedSeconds((p) => p + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatTime(s: number): string {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  async function handleStart() {
    if (!token) return;
    setError(null);
    setCallStatus("connecting");

    let startResult: InterviewStartResult;
    try {
      startResult = await api.startInterview(token, interviewId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start interview");
      setCallStatus("idle");
      return;
    }

    if (!VAPI_PUBLIC_KEY) {
      setError("VITE_VAPI_PUBLIC_KEY is not configured. Add it to your .env file.");
      setCallStatus("idle");
      return;
    }

    try {
      finalizedRef.current = false;
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(VAPI_PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        setCallStatus("connected");
        startTimer();
      });
      vapi.on("speech-start", () => setCallStatus("speaking"));
      vapi.on("speech-end", () => setCallStatus("listening"));
      vapi.on("call-end", () => {
        setCallStatus("ended");
        stopTimer();
        void finalizeInterview();
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vapi.on("message", (msg: any) => {
        if (msg.type === "transcript" && msg.transcriptType === "final") {
          const turn: ConversationTurn = {
            id: Date.now(),
            role: msg.role ?? "unknown",
            content: msg.transcript ?? "",
            timestamp: new Date().toISOString(),
          };
          setTranscript((prev) => [...prev, turn]);
        }
      });
      vapi.on("error", (err: unknown) => {
        const errMsg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Voice call error";
        setError(errMsg);
        setCallStatus("error");
        stopTimer();
      });

      await vapi.start(startResult.assistant_config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize voice call");
      setCallStatus("idle");
    }
  }

  async function handleEnd() {
    if (vapiRef.current) {
      try {
        vapiRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    setCallStatus("ended");
    stopTimer();
    await finalizeInterview();
  }

  const statusLabels: Record<CallStatus, string> = {
    idle: "Ready to start",
    connecting: "Connecting...",
    connected: "Connected",
    speaking: "AI is speaking...",
    listening: "Listening to you...",
    ended: "Interview ended",
    error: "Connection error",
  };

  const statusBg: Record<CallStatus, string> = {
    idle: "bg-ink-100 text-ink-500 border-ink-200",
    connecting: "bg-amber-50 text-amber-700 border-amber-200",
    connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
    speaking: "bg-brand-50 text-brand-700 border-brand-200",
    listening: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ended: "bg-ink-100 text-ink-500 border-ink-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  const isActive = ["connected", "speaking", "listening"].includes(callStatus);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate("/")}
          disabled={isActive}
          className="btn-ghost"
        >
          <ArrowLeft size={16} /> Back
        </button>
        {interview && (
          <span className="text-sm text-ink-500 capitalize">
            {interview.interview_type.replace("_", " ")} · {interview.target_role} · {interview.difficulty} ·{" "}
            {interview.duration_minutes} min
          </span>
        )}
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <section className="surface-card p-6 flex flex-col items-center gap-4">
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${statusBg[callStatus]}`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${isActive ? "pulse-dot" : ""} bg-current`} />
          {statusLabels[callStatus]}
        </div>

        {isActive && (
          <div className="text-4xl font-bold text-ink-900 tabular-nums">{formatTime(elapsedSeconds)}</div>
        )}

        <div className="flex gap-3">
          {callStatus === "idle" && (
            <button type="button" onClick={() => void handleStart()} className="btn-success">
              <Mic size={16} /> Start Interview
            </button>
          )}
          {isActive && (
            <button type="button" onClick={handleEnd} className="btn-danger">
              <PhoneOff size={16} /> End Interview
            </button>
          )}
          {callStatus === "ended" && (
            <button
              type="button"
              onClick={() => navigate(`/interview/${interviewId}/feedback`)}
              className="btn-success"
            >
              View Results
            </button>
          )}
        </div>
      </section>

      <section className="surface-card p-5">
        <h3 className="text-sm font-semibold text-ink-500 uppercase tracking-wide mb-3">Live Transcript</h3>
        <div className="max-h-[400px] overflow-y-auto flex flex-col gap-2.5 pr-1">
          {transcript.length === 0 && (
            <p className="text-ink-400 italic text-center py-6 text-sm">
              {callStatus === "idle"
                ? "Start the interview to see the transcript."
                : "Waiting for conversation..."}
            </p>
          )}
          {transcript.map((turn) => (
            <div
              key={turn.id}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                turn.role === "assistant"
                  ? "self-start bg-brand-50 text-ink-900 rounded-bl-sm"
                  : "self-end bg-emerald-50 text-ink-900 rounded-br-sm"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-0.5">
                {turn.role === "assistant" ? "Interviewer" : "You"}
              </span>
              <p className="text-sm leading-relaxed">{turn.content}</p>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </section>
    </div>
  );
}
