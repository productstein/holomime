"use client";

import { useStudioStore } from "@/stores/studio";
import type { Provider } from "@holomime/types";

const providers: { value: Provider; label: string; color: string }[] = [
  { value: "anthropic", label: "Claude", color: "bg-amber-500" },
  { value: "openai", label: "GPT", color: "bg-emerald-500" },
  { value: "gemini", label: "Gemini", color: "bg-sky-500" },
  { value: "ollama", label: "Local", color: "bg-zinc-500" },
];

export function ProviderSelector() {
  const selectedProvider = useStudioStore((s) => s.selectedProvider);
  const setSelectedProvider = useStudioStore((s) => s.setSelectedProvider);

  return (
    <div className="flex items-center gap-1 rounded-lg bg-zinc-800/50 p-0.5">
      {providers.map((p) => (
        <button
          key={p.value}
          onClick={() => setSelectedProvider(p.value)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all ${
            selectedProvider === p.value
              ? "bg-zinc-700 text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${p.color}`} />
          {p.label}
        </button>
      ))}
    </div>
  );
}
