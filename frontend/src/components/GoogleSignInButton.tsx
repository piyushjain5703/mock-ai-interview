import { GoogleLogin } from "@react-oauth/google";
import { useState } from "react";

import { api } from "../api";
import { useAuth } from "../auth/AuthContext";

type Props = {
  onError?: (message: string) => void;
};

export default function GoogleSignInButton({ onError }: Props) {
  const { setToken } = useAuth();
  const [loading, setLoading] = useState(false);

  const clientConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  if (!clientConfigured) {
    return (
      <button
        type="button"
        className="social-tile w-full"
        disabled
        title="VITE_GOOGLE_CLIENT_ID is not configured"
      >
        <GoogleLogo />
      </button>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60">
          <div className="spinner" />
        </div>
      )}
      <GoogleLogin
        onSuccess={async (credentialResponse) => {
          if (!credentialResponse.credential) {
            onError?.("Google did not return a credential.");
            return;
          }
          setLoading(true);
          try {
            const res = await api.googleAuth(credentialResponse.credential);
            setToken(res.access_token);
          } catch (err) {
            onError?.(err instanceof Error ? err.message : "Google sign-in failed");
          } finally {
            setLoading(false);
          }
        }}
        onError={() => onError?.("Google sign-in failed")}
        theme="outline"
        size="large"
        width="100%"
        useOneTap={false}
      />
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.2 34.9 26.7 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.2 5.2C41.5 35.4 44 30.1 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}
