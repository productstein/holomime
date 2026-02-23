"use client";

import { useStudioStore } from "@/stores/studio";
import type { PersonalityTraits } from "@holomime/types";
import { TRAIT_LABELS, type TraitDimension } from "@holomime/config";

interface TraitSliderProps {
  dimension: TraitDimension;
}

export function TraitSlider({ dimension }: TraitSliderProps) {
  const value = useStudioStore((s) => s.traits[dimension as keyof PersonalityTraits]);
  const setTrait = useStudioStore((s) => s.setTrait);
  const label = TRAIT_LABELS[dimension];
  const fillPercent = Math.round(value * 100);

  return (
    <div className="group py-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-zinc-300 capitalize">
          {dimension.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-xs tabular-nums text-zinc-500 transition-colors group-hover:text-violet-400">
          {value.toFixed(2)}
        </span>
      </div>

      <div className="relative h-1.5 rounded-full bg-zinc-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-[width] duration-75"
          style={{ width: `${fillPercent}%` }}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => setTrait(dimension as keyof PersonalityTraits, parseFloat(e.target.value))}
          className="trait-slider absolute inset-0 w-full cursor-pointer"
        />
      </div>

      <div className="mt-1 flex justify-between">
        <span className="text-[10px] text-zinc-600">{label.low}</span>
        <span className="text-[10px] text-zinc-600">{label.high}</span>
      </div>
    </div>
  );
}
