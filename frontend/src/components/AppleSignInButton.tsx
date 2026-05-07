import { useState } from "react";

import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: Record<string, unknown>) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; code: string; state?: string };
          user?: { name?: { firstName?: string; lastName?: string }; email?: string };
        }>;
      };
    };
  }
}

type Props = {
  onError?: (message: string) => void;
};

export default function AppleSignInButton({ onError }: Props) {
  const { setToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const clientId = import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined;
  const redirectUri = import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined;
  const configured = Boolean(clientId);

  async function handleClick() {
    if (!configured || !window.AppleID) {
      onError?.("Apple sign-in is not configured.");
      return;
    }
    setLoading(true);
    try {
      window.AppleID.auth.init({
        clientId,
        scope: "name email",
        redirectURI: redirectUri,
        usePopup: true,
      });
      const result = await window.AppleID.auth.signIn();
      const fullName = [result.user?.name?.firstName, result.user?.name?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const res = await api.appleAuth(result.authorization.id_token, fullName || undefined);
      setToken(res.access_token);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Apple sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || !configured}
      className="social-tile w-full"
      title={configured ? "Sign in with Apple" : "VITE_APPLE_CLIENT_ID is not configured"}
    >
      {loading ? (
        <div className="spinner" />
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.365 1.43c0 1.14-.42 2.22-1.13 3.04-.77.88-2.04 1.55-3.07 1.47-.13-1.11.43-2.25 1.13-2.99.78-.83 2.13-1.46 3.07-1.52zM20.5 17.27c-.55 1.27-.81 1.83-1.51 2.95-.98 1.55-2.36 3.49-4.07 3.5-1.52.02-1.91-.99-3.97-.98-2.06.02-2.49 1-4.01.98-1.71-.01-3.02-1.76-4-3.31C.93 16.62.27 11.78 2.51 8.7 4.1 6.51 6.6 5.27 8.96 5.27c2.4 0 3.91 1.32 5.9 1.32 1.92 0 3.09-1.32 5.86-1.32 2.1 0 4.32 1.14 5.9 3.11-5.18 2.84-4.34 10.28-.13 8.89z" />
        </svg>
      )}
    </button>
  );
}
