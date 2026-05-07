import { Eye, EyeOff, Lock, LogIn, Mail, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import AppleSignInButton from "../components/AppleSignInButton";
import GoogleSignInButton from "../components/GoogleSignInButton";

type Mode = "login" | "signup";

export default function AuthPage({ mode }: { mode: Mode }) {
  const { setToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const heading = isSignup ? "Create your account" : "Sign in with email";
  const subheading = isSignup
    ? "Practice interviews with an AI coach. Get instant feedback. It's free."
    : "Welcome back. Pick up where you left off.";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = isSignup ? await api.signup(email, password) : await api.login(email, password);
      setToken(res.access_token);
      const from = (location.state as { from?: string } | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sky-deep relative overflow-hidden">
      <CloudDecor />
      <div className="absolute top-6 left-6 flex items-center gap-2 z-10">
        <div className="w-10 h-10 rounded-xl bg-ink-900 text-white grid place-items-center font-bold shadow-md">
          M
        </div>
        <span className="font-bold text-ink-900 text-lg">MockAI</span>
      </div>

      <div className="relative z-10 min-h-screen grid place-items-center px-4 py-12">
        <div className="glass-card w-full max-w-md p-8 sm:p-10">
          <div className="flex justify-center -mt-20 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-lg grid place-items-center">
              {isSignup ? (
                <UserPlus className="text-ink-900" size={28} />
              ) : (
                <LogIn className="text-ink-900" size={28} />
              )}
            </div>
          </div>

          <h1 className="text-center text-2xl sm:text-3xl font-bold text-ink-900">{heading}</h1>
          <p className="text-center text-ink-500 mt-2 text-sm sm:text-base">{subheading}</p>

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="text-input"
                autoComplete="email"
              />
            </div>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"
              />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="text-input pr-10"
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-ink-400 hover:text-ink-900"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {!isSignup && (
              <div className="text-right">
                <button
                  type="button"
                  className="text-sm text-ink-500 hover:text-ink-900"
                  onClick={() => setError("Password recovery isn't available yet.")}
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Please wait..." : isSignup ? "Create account" : "Get Started"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-ink-400">
            <div className="flex-1 border-t border-dashed border-ink-400/40" />
            <span>Or {isSignup ? "sign up" : "sign in"} with</span>
            <div className="flex-1 border-t border-dashed border-ink-400/40" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <GoogleSignInButton onError={setError} />
            <AppleSignInButton onError={setError} />
          </div>

          <p className="mt-6 text-center text-sm text-ink-500">
            {isSignup ? "Already have an account?" : "New here?"}{" "}
            <Link
              to={isSignup ? "/login" : "/signup"}
              className="text-brand-600 font-semibold hover:underline"
            >
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function CloudDecor() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute -bottom-10 left-0 right-0 h-1/2 bg-gradient-to-t from-white/80 via-white/30 to-transparent" />
      <svg
        className="absolute bottom-0 left-0 w-full opacity-70"
        viewBox="0 0 1200 200"
        preserveAspectRatio="none"
      >
        <path
          d="M0 120 Q150 60 300 110 T600 100 T900 110 T1200 90 V200 H0 Z"
          fill="white"
          fillOpacity="0.6"
        />
      </svg>
      <div className="absolute top-1/4 left-10 w-40 h-40 rounded-full bg-white/40 blur-2xl animate-floaty" />
      <div className="absolute top-1/3 right-16 w-56 h-56 rounded-full bg-white/30 blur-3xl animate-floaty" />
    </div>
  );
}
