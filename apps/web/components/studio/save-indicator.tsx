"use client";

import { useEffect, useRef } from "react";
import { useStudioStore } from "@/stores/studio";
import { trpc } from "@/lib/trpc";

export function SaveIndicator() {
  const isDirty = useStudioStore((s) => s.isDirty);
  const isSaving = useStudioStore((s) => s.isSaving);
  const lastSavedAt = useStudioStore((s) => s.lastSavedAt);
  const agentId = useStudioStore((s) => s.agentId);
  const traits = useStudioStore((s) => s.traits);
  const facets = useStudioStore((s) => s.facets);
  const signatures = useStudioStore((s) => s.signatures);
  const preferences = useStudioStore((s) => s.preferences);
  const markSaving = useStudioStore((s) => s.markSaving);
  const markSaved = useStudioStore((s) => s.markSaved);

  const updateVector = trpc.vector.update.useMutation({
    onSuccess: () => markSaved(),
    onError: () => useStudioStore.setState({ isSaving: false }),
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isDirty || !agentId || isSaving) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      markSaving();
      updateVector.mutate({ agentId, traits, facets, signatures, preferences });
    }, 3000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, agentId, traits, facets, signatures, preferences]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  return (
    <div className="flex items-center gap-2 text-xs">
      {isSaving && (
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Saving...
        </span>
      )}
      {!isSaving && isDirty && (
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          Unsaved
        </span>
      )}
      {!isSaving && !isDirty && lastSavedAt && (
        <span className="flex items-center gap-1.5 text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Saved
        </span>
      )}
    </div>
  );
}
