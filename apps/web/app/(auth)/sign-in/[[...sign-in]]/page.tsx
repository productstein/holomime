"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import Link from "next/link";

function SSOCallback() {
  return <AuthenticateWithRedirectCallback />;
}

function SignInForm() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleOAuth = async (strategy: "oauth_google" | "oauth_github") => {
    if (!isLoaded || !signIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "OAuth sign-in failed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Additional verification required. Please check your email.");
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    if (!isLoaded || !signIn) return;
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email,
      });
      setSuccess("Password reset email sent. Check your inbox.");
      setError("");
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "Could not send reset email.");
    }
  };

  return (
      <main className="flex min-h-screen items-center justify-center bg-[#faf6f1] px-6 pt-20 pb-20">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="rounded-2xl bg-white p-8 shadow-xl shadow-black/5 border border-[#e5e2de]">
            {/* Header */}
            <div className="text-center mb-6">
              <img src="/logo-icon.svg" alt="" className="mx-auto mb-3 h-10 w-10" />
              <h1 className="text-xl font-bold text-[#2d2c2b]">Welcome back</h1>
              <p className="mt-1 text-sm text-[#6b6966]">Sign in to your account</p>
            </div>

            {/* OAuth buttons */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleOAuth("oauth_google")}
                disabled={!isLoaded}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#e5e2de] bg-white px-4 py-2.5 text-sm font-medium text-[#2d2c2b] transition-colors hover:bg-[#faf6f1] disabled:opacity-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <button
                type="button"
                onClick={() => handleOAuth("oauth_github")}
                disabled={!isLoaded}
                className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#24292e] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd"/>
                </svg>
                Continue with GitHub
              </button>
            </div>

            {/* Divider */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e5e2de]" />
              <span className="text-xs text-[#6b6966]">or</span>
              <div className="h-px flex-1 bg-[#e5e2de]" />
            </div>

            {/* Email/password form */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-[#6b6966] mb-1">Email</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-[#e5e2de] bg-white px-3 py-2.5 text-sm text-[#2d2c2b] placeholder:text-[#6b6966]/50 outline-none transition-colors focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-[#6b6966] mb-1">Password</label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full rounded-lg border border-[#e5e2de] bg-white px-3 py-2.5 text-sm text-[#2d2c2b] placeholder:text-[#6b6966]/50 outline-none transition-colors focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
                />
              </div>

              {/* Error/success message */}
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              {success && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>
              )}

              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="w-full rounded-lg bg-gradient-to-r from-[#f97066] to-[#8b5cf6] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#f97066]/20 transition-all hover:shadow-xl hover:shadow-[#f97066]/30 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {/* Forgot password */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-[#8b5cf6] hover:text-[#2d2c2b] transition-colors"
              >
                Forgot your password?
              </button>
            </div>

            {/* Demo login */}
            <div className="mt-4">
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#e5e2de]" />
                <span className="text-xs text-[#6b6966]">or</span>
                <div className="h-px flex-1 bg-[#e5e2de]" />
              </div>
              <a
                href="https://www.holomime.dev/demo"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#8b5cf6] bg-[#f5f3ff] px-4 py-2.5 text-sm font-medium text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/10"
              >
                Try Demo — no account needed
              </a>
            </div>

            {/* SSO login */}
            <div className="mt-4">
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#e5e2de]" />
                <span className="text-xs text-[#6b6966]">enterprise SSO</span>
                <div className="h-px flex-1 bg-[#e5e2de]" />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Organization slug"
                  className="flex-1 rounded-lg border border-[#e5e2de] bg-white px-3 py-2.5 text-sm text-[#2d2c2b] placeholder:text-[#6b6966]/50 outline-none transition-colors focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20"
                />
                <button
                  type="button"
                  className="whitespace-nowrap rounded-lg border border-[#8b5cf6] bg-[#f5f3ff] px-4 py-2.5 text-sm font-medium text-[#8b5cf6] transition-colors hover:bg-[#8b5cf6]/10"
                >
                  Continue with SSO
                </button>
              </div>
            </div>

            {/* Sign up link */}
            <p className="mt-5 text-center text-sm text-[#6b6966]">
              Don&apos;t have an account?{" "}
              <Link href="/sign-up" className="font-medium text-[#8b5cf6] hover:text-[#2d2c2b] transition-colors">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </main>
  );
}

export default function SignInPage() {
  const pathname = usePathname();

  if (pathname?.includes("sso-callback")) {
    return <SSOCallback />;
  }

  return <SignInForm />;
}
