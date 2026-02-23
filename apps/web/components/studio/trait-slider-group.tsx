"use client";

import { TraitSlider } from "./trait-slider";
import { TRAIT_GROUPS } from "@holomime/config";

export function TraitSliderGroup() {
  return (
    <div className="space-y-5">
      {Object.entries(TRAIT_GROUPS).map(([groupName, dimensions]) => (
        <div key={groupName}>
          <div className="mb-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              {groupName}
            </span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
          <div className="space-y-0.5">
            {dimensions.map((dimension) => (
              <TraitSlider key={dimension} dimension={dimension} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
