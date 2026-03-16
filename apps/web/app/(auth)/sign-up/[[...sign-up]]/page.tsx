"use client";

import { useSignUp } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import Link from "next/link";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58Z" fill="#EA4335" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function SSOCallback() {
  return <AuthenticateWithRedirectCallback />;
}

function SignUpForm() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleOAuth = async (strategy: "oauth_google" | "oauth_github") => {
    if (!isLoaded || !signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: "/dashboard",
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "OAuth sign-up failed");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setLoading(true);
    setError("");
    try {
      await signUp.create({
        emailAddress: email,
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setVerifying(true);
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    setLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-6 pt-20 pb-20">
        <div className="w-full max-w-md">
          <div className="rounded-2xl bg-white p-8 shadow-xl shadow-black/5 border border-[#e8e4df]">
            <div className="text-center mb-6">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#f97066] to-[#8b5cf6]">
                <span className="text-lg font-bold text-white">H</span>
              </div>
              <h1 className="text-xl font-bold text-[#1a1a1a]">Verify your email</h1>
              <p className="mt-1 text-sm text-[#6b6560]">
                We sent a code to <strong className="text-[#1a1a1a]">{email}</strong>
              </p>
            </div>
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label htmlFor="code" className="block text-xs font-medium text-[#6b6560] mb-1.5">
                  Verification code
                </label>
                <input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-[#e8e4df] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] text-center tracking-widest placeholder:text-[#6b6560]/50 placeholder:tracking-normal focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 focus:outline-none transition-colors"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="w-full rounded-lg bg-gradient-to-r from-[#f97066] to-[#8b5cf6] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#f97066]/20 transition-all hover:shadow-xl hover:shadow-[#f97066]/30 disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify Email"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-6 pt-20 pb-20">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-xl shadow-black/5 border border-[#e8e4df]">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#f97066] to-[#8b5cf6]">
              <span className="text-lg font-bold text-white">H</span>
            </div>
            <h1 className="text-xl font-bold text-[#1a1a1a]">Create your account</h1>
            <p className="mt-1 text-sm text-[#6b6560]">Start building agents with personality</p>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => handleOAuth("oauth_google")}
              disabled={!isLoaded}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#e8e4df] bg-white px-4 py-2.5 text-sm font-medium text-[#1a1a1a] transition-colors hover:bg-[#faf9f7] disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth("oauth_github")}
              disabled={!isLoaded}
              className="flex w-full items-center justify-center gap-3 rounded-lg bg-[#24292e] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1e22] disabled:opacity-50"
            >
              <GitHubIcon />
              Continue with GitHub
            </button>
          </div>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#e8e4df]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-[#6b6560]">or</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#6b6560] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-[#e8e4df] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#6b6560]/50 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-[#6b6560] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-[#e8e4df] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#6b6560]/50 focus:border-[#8b5cf6] focus:ring-2 focus:ring-[#8b5cf6]/20 focus:outline-none transition-colors"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isLoaded}
              className="w-full rounded-lg bg-gradient-to-r from-[#f97066] to-[#8b5cf6] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#f97066]/20 transition-all hover:shadow-xl hover:shadow-[#f97066]/30 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#6b6560]">
              Already have an account?{" "}
              <Link href="/sign-in" className="font-medium text-[#8b5cf6] hover:text-[#1a1a1a] transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  const pathname = usePathname();

  if (pathname?.includes("sso-callback")) {
    return <SSOCallback />;
  }

  return <SignUpForm />;
}
