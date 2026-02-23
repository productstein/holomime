"use client";

import { useStudioStore } from "@/stores/studio";
import { generateAvatar, generateCharacterSheet } from "@holomime/core";
import type { PersonalityTraits } from "@holomime/types";

export function AvatarPreview() {
  const traits = useStudioStore((s) => s.traits);
  const signatures = useStudioStore((s) => s.signatures);
  const agentName = useStudioStore((s) => s.agentName);

  const svgData = generateAvatar(traits, { size: 160 });
  const sheet = generateCharacterSheet(agentName || "Unnamed Agent", traits, signatures.archetype);

  // Map warmth to hue for the glow
  const hue = Math.round(220 + (traits.warmth * (35 - 220 + 360)) % 360);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-md mx-auto">
      {/* Avatar with glow */}
      <div className="relative">
        <div
          className="absolute inset-0 rounded-full blur-3xl opacity-30"
          style={{ background: `hsl(${hue}, 70%, 50%)` }}
        />
        <div
          className="relative h-40 w-40 rounded-full border border-zinc-700 bg-zinc-800 p-2"
          dangerouslySetInnerHTML={{ __html: svgData }}
        />
      </div>

      {/* Name + archetype */}
      <div className="text-center">
        <h3 className="text-xl font-semibold text-zinc-100">{agentName || "Unnamed Agent"}</h3>
        {signatures.archetype && (
          <span className="mt-1 inline-block rounded-full bg-violet-500/10 px-3 py-0.5 text-sm font-medium text-violet-400 capitalize">
            {signatures.archetype}
          </span>
        )}
      </div>

      {/* Dominant traits */}
      <div className="w-full space-y-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 text-center">
          Character Profile
        </div>
        <div className="grid grid-cols-2 gap-2">
          {sheet.dominantTraits.slice(0, 4).map((traitName) => {
            const value = traits[traitName as keyof PersonalityTraits] ?? 0;
            return (
              <div key={traitName} className="rounded-lg bg-zinc-800/50 border border-zinc-800 px-3 py-2">
                <div className="text-[11px] text-zinc-500 capitalize">{traitName.replace(/_/g, " ")}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                      style={{ width: `${Math.round(value * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-400">{value.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-zinc-800/30 py-2">
            <div className="font-mono text-lg font-bold text-zinc-200">{sheet.overallWarmth.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">Warmth</div>
          </div>
          <div className="rounded-lg bg-zinc-800/30 py-2">
            <div className="font-mono text-lg font-bold text-zinc-200">{sheet.overallEnergy.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">Energy</div>
          </div>
          <div className="rounded-lg bg-zinc-800/30 py-2">
            <div className="font-mono text-lg font-bold text-zinc-200">{sheet.overallPrecision.toFixed(2)}</div>
            <div className="text-[10px] text-zinc-500">Precision</div>
          </div>
        </div>
      </div>
    </div>
  );
}
