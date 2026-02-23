"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { ARCHETYPES } from "@holomime/config";

export default function DashboardPage() {
  const { data: agents, isLoading } = trpc.agent.list.useQuery();
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Your Agents</h1>
          <p className="mt-1 text-sm text-zinc-500">Beings you&apos;ve brought to life</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="group rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20"
        >
          Bring a new agent to life
          <span className="ml-1.5 inline-block transition-transform group-hover:translate-x-0.5">&rarr;</span>
        </button>
      </div>

      {/* Agent grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : agents?.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {agents?.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </motion.div>
      )}

      {/* Create modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateAgentModal onClose={() => setShowCreateModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentCard({ agent }: { agent: any }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      <Link
        href={`/studio/${agent.id}`}
        className="group block rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all hover:border-violet-500/30 hover:bg-zinc-900 hover:shadow-lg hover:shadow-violet-500/5"
      >
        <div className="flex items-start gap-4">
          {/* Avatar circle */}
          <div className="relative flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 opacity-80 transition-all group-hover:opacity-100 group-hover:shadow-lg group-hover:shadow-violet-500/20" />
            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900 ${agent.currentVectorId ? "bg-emerald-400" : "bg-zinc-600"}`} />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-zinc-100 transition-colors group-hover:text-violet-300">
              {agent.name}
            </h3>
            <p className="font-mono text-xs text-zinc-500">@{agent.handle}</p>
          </div>
        </div>

        {agent.description && (
          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-zinc-400">{agent.description}</p>
        )}

        <div className="mt-4 flex items-center gap-2">
          {agent.isPublic && (
            <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-[11px] font-medium text-violet-400">
              Public
            </span>
          )}
          {agent.forkCount > 0 && (
            <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
              {agent.forkCount} forks
            </span>
          )}
          <span className="ml-auto text-[11px] text-zinc-600">
            {new Date(agent.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 py-20"
    >
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20" />
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-600/30 to-fuchsia-600/30" />
        <div className="absolute inset-4 rounded-full bg-gradient-to-br from-violet-600/40 to-fuchsia-600/40" />
        <div className="absolute inset-6 flex items-center justify-center rounded-full bg-violet-600/60">
          <span className="text-lg text-white">+</span>
        </div>
      </div>

      <h3 className="text-xl font-semibold text-zinc-100">No agents yet</h3>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-zinc-500">
        Every great agent starts here. Choose an archetype or start from scratch.
        You&apos;re Geppetto — bring your first Pinocchio to life.
      </p>
      <button
        onClick={onCreateClick}
        className="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20"
      >
        Create your first agent &rarr;
      </button>
    </motion.div>
  );
}

function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [archetype, setArchetype] = useState<string>("");

  const utils = trpc.useUtils();
  const createAgent = trpc.agent.create.useMutation({
    onSuccess: () => {
      utils.agent.list.invalidate();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createAgent.mutate({
      name,
      handle: handle || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      description: description || undefined,
      archetype: archetype ? (archetype as any) : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="mx-4 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold text-zinc-100">Bring a new agent to life</h2>
        <p className="mt-1 text-sm text-zinc-500">Choose who they&apos;ll be. You can always reshape them later.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Atlas, Sage, Kai..."
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Handle</label>
            <div className="mt-1.5 flex items-center rounded-lg border border-zinc-700 bg-zinc-800">
              <span className="px-3 text-sm text-zinc-500">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="my-agent"
                className="flex-1 bg-transparent py-2.5 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-300">Start from an archetype</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ARCHETYPES).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setArchetype(archetype === key ? "" : key)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    archetype === key
                      ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/20"
                      : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                  }`}
                >
                  <span className="block text-sm font-medium text-zinc-200">{config.name}</span>
                  <span className="block text-[11px] text-zinc-500">{config.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || createAgent.isPending}
              className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-medium text-white transition-all hover:bg-violet-500 disabled:opacity-50"
            >
              {createAgent.isPending ? "Creating..." : "Bring to life"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
