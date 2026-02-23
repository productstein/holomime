"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">Manage your account and API keys</p>

      <div className="mt-8 space-y-8">
        <ProfileSection />
        <ApiKeysSection />
        <BillingSection />
      </div>
    </div>
  );
}

function ProfileSection() {
  const { data: user } = trpc.user.getMe.useQuery();
  const updateProfile = trpc.user.updateProfile.useMutation();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-sm font-semibold text-zinc-200">Profile</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Display Name</label>
          <input
            type="text"
            defaultValue={user?.displayName ?? ""}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5">Bio</label>
          <textarea
            defaultValue={user?.bio ?? ""}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 resize-none"
          />
        </div>
        <button
          onClick={() => updateProfile.mutate({ displayName, bio })}
          disabled={updateProfile.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          {updateProfile.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </section>
  );
}

function ApiKeysSection() {
  const { data: keys, refetch } = trpc.user.getApiKeys.useQuery();
  const createKey = trpc.user.createApiKey.useMutation({ onSuccess: () => refetch() });
  const revokeKey = trpc.user.revokeApiKey.useMutation({ onSuccess: () => refetch() });
  const [keyName, setKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleCreate = () => {
    if (!keyName) return;
    createKey.mutate({ name: keyName }, {
      onSuccess: (data) => {
        setNewKey(data.key);
        setKeyName("");
      },
    });
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-sm font-semibold text-zinc-200">API Keys</h2>
      <p className="mt-1 text-xs text-zinc-500">Keys for the HoloMime SDK and REST API</p>

      {newKey && (
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-400">Your new API key (copy it now — you won&apos;t see it again):</p>
          <code className="mt-2 block break-all rounded bg-zinc-800 p-2 font-mono text-xs text-zinc-200">{newKey}</code>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={keyName}
          onChange={(e) => setKeyName(e.target.value)}
          placeholder="Key name (e.g., Production)"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500/50"
        />
        <button
          onClick={handleCreate}
          disabled={!keyName || createKey.isPending}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
        >
          Create
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {keys?.map((key) => (
          <div key={key.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/50 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-400" />
              <div>
                <span className="text-sm font-medium text-zinc-200">{key.name}</span>
                <span className="ml-2 font-mono text-xs text-zinc-600">{key.prefix}...</span>
              </div>
            </div>
            <button
              onClick={() => revokeKey.mutate({ id: key.id })}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Revoke
            </button>
          </div>
        ))}
        {keys?.length === 0 && (
          <p className="text-sm text-zinc-600 py-4 text-center">No API keys yet.</p>
        )}
      </div>
    </section>
  );
}

function BillingSection() {
  const { data: user } = trpc.user.getMe.useQuery();

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h2 className="text-sm font-semibold text-zinc-200">Billing</h2>
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-200 capitalize">
            {user?.plan ?? "free"} Plan
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {user?.plan === "free" ? "3 agents, 1,000 compiled requests/month" : "Unlimited agents"}
          </p>
        </div>
        {user?.plan === "free" && (
          <a
            href="/api/stripe/checkout?plan=pro"
            className="rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </a>
        )}
      </div>
    </section>
  );
}
