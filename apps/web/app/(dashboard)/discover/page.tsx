"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"trending" | "most_forked" | "newest">("trending");

  const { data: agents, isLoading } = trpc.discover.browse.useQuery({
    sortBy,
    limit: 20,
  });

  const { data: searchResults } = trpc.discover.search.useQuery(
    { query },
    { enabled: query.length >= 2 }
  );

  const displayAgents = query.length >= 2 ? searchResults : agents;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Discover</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Explore agents built by the community. Fork one to make it your own.
        </p>
      </div>

      {/* Search + filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-80">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20"
          />
        </div>

        <div className="flex gap-1 rounded-lg bg-zinc-800/50 p-1">
          {(["trending", "most_forked", "newest"] as const).map((sort) => (
            <button
              key={sort}
              onClick={() => setSortBy(sort)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                sortBy === sort
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {sort === "trending" ? "Trending" : sort === "most_forked" ? "Most Forked" : "Newest"}
            </button>
          ))}
        </div>
      </div>

      {/* Results grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 animate-pulse">
              <div className="h-5 w-32 rounded bg-zinc-800 mb-2" />
              <div className="h-3 w-20 rounded bg-zinc-800 mb-4" />
              <div className="h-3 w-full rounded bg-zinc-800 mb-1" />
              <div className="h-3 w-2/3 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      ) : displayAgents?.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 mb-3">
            <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
          <p className="text-zinc-400 text-sm">No agents found.</p>
          <p className="text-zinc-600 text-xs mt-1">Try a different search term.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayAgents?.map((agent) => (
            <Link
              key={agent.id}
              href={`/agents/${agent.handle}`}
              className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-all hover:border-violet-500/30 hover:bg-zinc-900"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center text-sm font-bold text-white">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-100 group-hover:text-violet-400 transition-colors">
                    {agent.name}
                  </h3>
                  <p className="font-mono text-[11px] text-zinc-600">@{agent.handle}</p>
                </div>
              </div>

              {agent.description && (
                <p className="line-clamp-2 text-sm text-zinc-400 leading-relaxed">{agent.description}</p>
              )}

              <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-600">
                <span>by @{agent.creator?.username}</span>
                <span className="font-mono">{agent.forkCount ?? 0} forks</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
