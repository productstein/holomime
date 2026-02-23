"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

function HealthRing({ value, label, size = 120 }: { value: number; label: string; size?: number }) {
  const pct = Math.round(value);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#27272a"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-2xl font-bold text-zinc-100">{pct}</span>
        </div>
      </div>
      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
    </div>
  );
}

function MetricCard({ label, value, unit, trend }: { label: string; value: string | number; unit?: string; trend?: "up" | "down" | "neutral" }) {
  const trendColors = {
    up: "text-emerald-400",
    down: "text-red-400",
    neutral: "text-zinc-500",
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-2xl font-bold text-zinc-100">{value}</span>
        {unit && <span className="text-sm text-zinc-500">{unit}</span>}
      </div>
    </div>
  );
}

function EventRow({ event }: { event: { id: string; eventType: string; metadata: Record<string, unknown>; createdAt: string } }) {
  const typeConfig: Record<string, { color: string; dot: string }> = {
    "response.generated": { color: "text-sky-400", dot: "bg-sky-400" },
    "response.rated": { color: "text-emerald-400", dot: "bg-emerald-400" },
    "policy.violation": { color: "text-red-400", dot: "bg-red-400" },
    "drift.detected": { color: "text-amber-400", dot: "bg-amber-400" },
    "eval.completed": { color: "text-violet-400", dot: "bg-violet-400" },
  };

  const config = typeConfig[event.eventType] ?? { color: "text-zinc-400", dot: "bg-zinc-400" };

  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      <span className={`text-sm font-mono ${config.color}`}>
        {event.eventType}
      </span>
      <span className="text-xs text-zinc-600 ml-auto font-mono">
        {new Date(event.createdAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

export default function HealthDashboardPage() {
  const params = useParams();
  const agentId = params.id as string;

  const { data: agent } = trpc.agent.get.useQuery({ id: agentId });
  const { data: health } = trpc.telemetry.getHealth.useQuery({ agentId });
  const { data: metrics } = trpc.telemetry.getMetrics.useQuery({ agentId });
  const { data: events } = trpc.telemetry.getRecentEvents.useQuery({ agentId, limit: 20 });

  const driftConfig: Record<string, { color: string; bg: string; description: string }> = {
    none: {
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      description: "Personality is stable and consistent across interactions.",
    },
    low: {
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      description: "Minor deviations detected \u2014 within normal range.",
    },
    moderate: {
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      description: "Noticeable drift from baseline. Consider reviewing recent interactions.",
    },
    high: {
      color: "text-red-400",
      bg: "bg-red-500/10",
      description: "Significant drift detected. Identity may be inconsistent.",
    },
  };

  const drift = driftConfig[health?.driftLevel ?? "none"];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Breadcrumb header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm">
            <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              Agents
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-300">{agent?.name ?? "\u2026"}</span>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-500">Health</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Health & Analytics</h1>
          <p className="text-zinc-500 text-sm mt-1">Watch them grow \u2014 monitor consistency, performance, and drift.</p>
        </div>
        <Link
          href={`/studio/${agentId}`}
          className="px-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800 text-sm font-medium text-zinc-200 hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
        >
          Open Studio
        </Link>
      </div>

      {/* Health rings */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 mb-6">
        <div className="flex items-center justify-around">
          <HealthRing
            value={health?.overall ?? 0}
            label="Overall"
            size={140}
          />
          <HealthRing
            value={health?.consistency ?? 0}
            label="Consistency"
          />
          <HealthRing
            value={health?.policyCompliance ?? 0}
            label="Compliance"
          />
          <HealthRing
            value={health?.performanceScore ?? 0}
            label="Performance"
          />
        </div>
      </div>

      {/* Drift + Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Drift card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-4">Personality Drift</div>
          <div className="flex items-center gap-3 mb-3">
            <div className={`rounded-lg px-3 py-1.5 text-lg font-mono font-bold capitalize ${drift.color} ${drift.bg}`}>
              {health?.driftLevel ?? "none"}
            </div>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {drift.description}
          </p>
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Total Events" value={metrics?.totalEvents ?? 0} />
          <MetricCard label="P50 Latency" value={metrics?.latency ? metrics.latency.p50 : "\u2014"} unit="ms" />
          <MetricCard label="Success Rate" value={metrics?.successRate ? `${Math.round(metrics.successRate * 100)}` : "\u2014"} unit="%" />
          <MetricCard label="Failed" value={metrics?.failedCount ?? 0} />
        </div>
      </div>

      {/* Recent Events */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-200">Recent Activity</h2>
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">last 20 events</span>
        </div>
        {events && events.length > 0 ? (
          <div className="divide-y divide-zinc-800/50">
            {events.map((event: any) => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 mb-3">
              <svg className="h-5 w-5 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
            <p className="text-zinc-400 text-sm">No activity yet.</p>
            <p className="text-zinc-600 text-xs mt-1">
              Events will appear here once your agent starts interacting with the world.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
