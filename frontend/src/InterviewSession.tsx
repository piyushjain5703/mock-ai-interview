import { useCallback, useEffect, useRef, useState } from "react";

import { api, type ConversationTurn, type InterviewDetail, type InterviewStartResult } from "./api";

const VAPI_PUBLIC_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY ?? "";

type CallStatus = "idle" | "connecting" | "connected" | "speaking" | "listening" | "ended" | "error";

type Props = {
  token: string;
  interviewId: number;
  onBack: () => void;
  onViewResults: () => void;
};

export default function InterviewSession({ token, interviewId, onBack, onViewResults }: Props) {
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
    try {
      const data = await api.getInterview(token, interviewId);
      setInterview(data);
      if (data.turns.length > 0) {
        setTranscript(data.turns);
      }
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
          // ignore cleanup errors
        }
      }
    };
  }, [loadInterview]);

  const finalizeInterview = useCallback(async () => {
    if (finalizedRef.current) return;
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
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  async function handleStart() {
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

      vapi.on("speech-start", () => {
        setCallStatus("speaking");
      });

      vapi.on("speech-end", () => {
        setCallStatus("listening");
      });

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
        console.error("Vapi error:", err);
        const errMsg = err instanceof Error ? err.message : typeof err === "object" && err !== null && "message" in err ? String((err as { message: unknown }).message) : "Voice call error";
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
        // ignore
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

  const statusColors: Record<CallStatus, string> = {
    idle: "#7c8db5",
    connecting: "#f0c040",
    connected: "#74f1a8",
    speaking: "#6eb5ff",
    listening: "#74f1a8",
    ended: "#7c8db5",
    error: "#ff7e8e",
  };

  const isActive = ["connected", "speaking", "listening"].includes(callStatus);

  return (
    <div className="interview-session">
      <div className="interview-header">
        <button className="ghost" type="button" onClick={onBack} disabled={isActive}>
          &larr; Back
        </button>
        <div className="interview-meta">
          {interview && (
            <span>
              {interview.interview_type.toUpperCase()} &middot; {interview.target_role} &middot;{" "}
              {interview.difficulty} &middot; {interview.duration_minutes} min
            </span>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="call-status-panel">
        <div className="status-indicator" style={{ borderColor: statusColors[callStatus] }}>
          <div
            className={`status-dot ${isActive ? "pulse" : ""}`}
            style={{ backgroundColor: statusColors[callStatus] }}
          />
          <span className="status-text">{statusLabels[callStatus]}</span>
        </div>

        {isActive && <div className="timer">{formatTime(elapsedSeconds)}</div>}

        <div className="call-controls">
          {callStatus === "idle" && (
            <button type="button" className="start-btn" onClick={() => void handleStart()}>
              Start Interview
            </button>
          )}
          {isActive && (
            <button type="button" className="end-btn" onClick={handleEnd}>
              End Interview
            </button>
          )}
          {callStatus === "ended" && (
            <button type="button" className="start-btn" onClick={onViewResults}>
              View Results
            </button>
          )}
        </div>
      </div>

      <div className="transcript-panel">
        <h3>Live Transcript</h3>
        <div className="transcript-feed">
          {transcript.length === 0 && (
            <p className="transcript-empty">
              {callStatus === "idle"
                ? "Start the interview to see the transcript."
                : "Waiting for conversation..."}
            </p>
          )}
          {transcript.map((turn) => (
            <div key={turn.id} className={`turn turn-${turn.role}`}>
              <span className="turn-role">{turn.role === "assistant" ? "Interviewer" : "You"}</span>
              <p className="turn-content">{turn.content}</p>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
}
