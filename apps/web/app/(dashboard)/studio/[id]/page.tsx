"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useStudioStore } from "@/stores/studio";
import { trpc } from "@/lib/trpc";
import { TraitSliderGroup } from "@/components/studio/trait-slider-group";
import { LiveChatPreview } from "@/components/studio/live-chat-preview";
import { AvatarPreview } from "@/components/studio/avatar-preview";
import { ProviderSelector } from "@/components/studio/provider-selector";
import { SaveIndicator } from "@/components/studio/save-indicator";
import type { PersonalityTraits, Facets, Signatures, Preferences } from "@holomime/types";

export default function StudioPage() {
  const params = useParams();
  const agentId = params.id as string;
  const activeTab = useStudioStore((s) => s.activeTab);
  const setActiveTab = useStudioStore((s) => s.setActiveTab);
  const loadVector = useStudioStore((s) => s.loadVector);

  // Fetch agent and current vector
  const { data: agent } = trpc.agent.get.useQuery({ id: agentId });
  const { data: vector } = trpc.vector.getCurrent.useQuery({ agentId });

  // Load vector into store when data arrives
  useEffect(() => {
    if (agent && vector) {
      loadVector({
        agentId: agent.id,
        agentName: agent.name,
        traits: vector.traits as PersonalityTraits,
        facets: (vector.facets as Facets) ?? {},
        signatures: (vector.signatures as Signatures) ?? { tone_palette: [], taboo_tones: [] },
        preferences: (vector.preferences as Preferences) ?? {},
      });
    }
  }, [agent, vector, loadVector]);

  if (!agent) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      {/* Studio header */}
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{agent.name}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Shape who they are</p>
        </div>
        <div className="flex items-center gap-4">
          <SaveIndicator />
          <ProviderSelector />
        </div>
      </div>

      {/* Three-column layout (stacks on mobile/tablet) */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-12">
        {/* Left: Trait Sliders */}
        <div className="overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-3">
          <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Character Traits
          </h2>
          <TraitSliderGroup />
        </div>

        {/* Center: Tabbed content (Chat / Character / Config) */}
        <div className="flex flex-col overflow-hidden lg:col-span-6 min-h-[400px]">
          {/* Tabs */}
          <div className="mb-3 flex gap-1 rounded-lg bg-zinc-800/50 p-1">
            <TabButton
              active={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            >
              Chat Preview
            </TabButton>
            <TabButton
              active={activeTab === "character"}
              onClick={() => setActiveTab("character")}
            >
              Character
            </TabButton>
            <TabButton
              active={activeTab === "config"}
              onClick={() => setActiveTab("config")}
            >
              Config
            </TabButton>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "chat" && <LiveChatPreview />}
            {activeTab === "character" && (
              <div className="flex h-full items-start justify-center overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
                <AvatarPreview />
              </div>
            )}
            {activeTab === "config" && (
              <div className="h-full overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <ConfigPanel />
              </div>
            )}
          </div>
        </div>

        {/* Right: Version Timeline */}
        <div className="overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-3">
          <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Journey So Far
          </h2>
          <VersionTimeline agentId={agentId} />
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
        active
          ? "bg-zinc-700 text-zinc-100 shadow-sm"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function VersionTimeline({ agentId }: { agentId: string }) {
  const { data: versions } = trpc.vector.listVersions.useQuery({ agentId });

  if (!versions?.length) {
    return <p className="text-sm text-zinc-600">No versions yet. Start shaping your agent&apos;s identity.</p>;
  }

  return (
    <div className="space-y-3">
      {versions.map((v, i) => (
        <div key={v.id} className="relative flex gap-3">
          {/* Timeline line */}
          {i < versions.length - 1 && (
            <div className="absolute left-[7px] top-5 h-full w-px bg-zinc-800" />
          )}
          {/* Dot */}
          <div className={`relative mt-1 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 ${
            i === 0 ? "border-violet-500 bg-violet-500" : "border-zinc-700 bg-zinc-900"
          }`} />
          {/* Content */}
          <div className="pb-4">
            <p className="text-sm font-medium text-zinc-200">Version {v.version}</p>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-600">
              {v.hash.slice(0, 12)}...
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-600">
              {new Date(v.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigPanel() {
  const facets = useStudioStore((s) => s.facets);
  const signatures = useStudioStore((s) => s.signatures);
  const preferences = useStudioStore((s) => s.preferences);
  const setFacets = useStudioStore((s) => s.setFacets);
  const setSignatures = useStudioStore((s) => s.setSignatures);
  const setPreferences = useStudioStore((s) => s.setPreferences);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Cognitive Style</h3>
        <select
          value={facets.cognitive_style ?? ""}
          onChange={(e) => setFacets({ cognitive_style: e.target.value as any || undefined })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
        >
          <option value="">Default</option>
          <option value="analytical">Analytical</option>
          <option value="systems_thinking">Systems Thinking</option>
          <option value="narrative">Narrative</option>
          <option value="first_principles">First Principles</option>
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Archetype</h3>
        <select
          value={signatures.archetype ?? ""}
          onChange={(e) => setSignatures({ archetype: e.target.value as any || undefined })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
        >
          <option value="">Custom</option>
          <option value="operator">Operator</option>
          <option value="visionary">Visionary</option>
          <option value="educator">Educator</option>
          <option value="closer">Closer</option>
          <option value="researcher">Researcher</option>
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Output Format</h3>
        <select
          value={preferences.output_format}
          onChange={(e) => setPreferences({ output_format: e.target.value as any })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
        >
          <option value="prose">Prose</option>
          <option value="bullets">Bullets</option>
          <option value="mixed">Mixed</option>
          <option value="structured">Structured</option>
        </select>
      </div>

      <div>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Decision Mode</h3>
        <select
          value={preferences.decision_mode}
          onChange={(e) => setPreferences({ decision_mode: e.target.value as any })}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500/50"
        >
          <option value="recommend_with_tradeoffs">Recommend with tradeoffs</option>
          <option value="just_decide">Just decide</option>
        </select>
      </div>
    </div>
  );
}
