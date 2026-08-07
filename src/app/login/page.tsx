"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { STAGES, STAGE_COLORS } from "@/lib/loop/constants";

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

const SYSTEMS = [
  { name: "Notion", role: "the narrative" },
  { name: "Azure DevOps", role: "the delivery" },
  { name: "the data stack", role: "the outcomes" },
];

const FEATURES = [
  "Board, Timeline, Horizon & Team views",
  "Transparent prioritization scoring",
  "Outcome metrics that close the loop after release",
];

function LoopStages() {
  return (
    <ol className="login-loop" aria-label="The product loop, stage by stage">
      {STAGES.map((stage, i) => (
        <li
          key={stage}
          className="login-loop-stage"
          style={{ ["--stage" as string]: STAGE_COLORS[stage] }}
        >
          <span className="login-loop-dot" aria-hidden />
          <span className="login-loop-label">{stage}</span>
          {i < STAGES.length - 1 && (
            <span className="login-loop-arrow" aria-hidden>
              →
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function LoginHero() {
  return (
    <div className="login-hero">
      <div className="login-hero-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="login-hero-logo"
          src="/brand/campminder-logo-white.svg"
          alt="Campminder"
        />

        <div className="eyebrow">Campminder · Internal</div>
        <h1 className="login-hero-title">Product Launchpad</h1>
        <p className="login-hero-tagline">Closing product loops faster.</p>

        <p className="login-hero-lede">
          From napkin idea to shipped outcome — without losing the thread. The
          whole product loop lives in one place, so nothing good dies in a
          backlog.
        </p>

        <div className="login-hero-section">
          <div className="login-hero-heading">One idea, all the way around</div>
          <LoopStages />
        </div>

        <div className="login-hero-section">
          <div className="login-hero-heading">
            The idea layer above the tools you already use
          </div>
          <div className="login-systems">
            {SYSTEMS.map((s) => (
              <div className="login-system" key={s.name}>
                <span className="login-system-name">{s.name}</span>
                <span className="login-system-role">{s.role}</span>
              </div>
            ))}
          </div>
          <p className="login-hero-note">It references them, never duplicates them.</p>
        </div>

        <ul className="login-features">
          {FEATURES.map((f) => (
            <li className="login-feature" key={f}>
              {f}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LoginInner() {
  const params = useSearchParams();
  const error = params.get("error");
  const [loading, setLoading] = useState(false);

  const signIn = async () => {
    setLoading(true);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/login?error=forbidden",
    });
  };

  return (
    <div className="login-split">
      <LoginHero />

      <div className="login-panel">
        <div className="login-card">
          <span className="login-brand-mark" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/cm-icon.svg" alt="" />
          </span>
          <h2 className="login-card-title">Sign in</h2>
          <p>
            Sign in with your Campminder Google account to jump into the
            roadmap.
          </p>
          {error && (
            <div className="login-error">
              <AlertCircle size={16} strokeWidth={2.2} />
              {error === "forbidden"
                ? "That account isn't a @campminder.com account. Product Launchpad is restricted to Campminder staff."
                : "Sign-in failed. Please try again."}
            </div>
          )}
          <button className="google-btn" onClick={signIn} disabled={loading}>
            <GoogleGlyph />
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>
          <div className="login-foot">Restricted to @campminder.com accounts</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
