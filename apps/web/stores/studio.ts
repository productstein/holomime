import { create } from "zustand";
import type { PersonalityTraits, Facets, Signatures, Preferences, Provider } from "@holomime/types";
import { ARCHETYPES } from "@holomime/config";

export interface StudioState {
  // Agent info
  agentId: string | null;
  agentName: string;

  // Personality vector
  traits: PersonalityTraits;
  facets: Facets;
  signatures: Signatures;
  preferences: Preferences;

  // UI state
  activeTab: "chat" | "character" | "config";
  selectedProvider: Provider;
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;

  // Actions
  setAgentId: (id: string) => void;
  setAgentName: (name: string) => void;
  setTrait: (dimension: keyof PersonalityTraits, value: number) => void;
  setTraits: (traits: Partial<PersonalityTraits>) => void;
  setFacets: (facets: Partial<Facets>) => void;
  setSignatures: (signatures: Partial<Signatures>) => void;
  setPreferences: (preferences: Partial<Preferences>) => void;
  setActiveTab: (tab: "chat" | "character" | "config") => void;
  setSelectedProvider: (provider: Provider) => void;
  loadVector: (data: {
    agentId: string;
    agentName: string;
    traits: PersonalityTraits;
    facets: Facets;
    signatures: Signatures;
    preferences: Preferences;
  }) => void;
  loadArchetype: (archetype: keyof typeof ARCHETYPES) => void;
  markSaving: () => void;
  markSaved: () => void;
  markDirty: () => void;
  reset: () => void;
}

const DEFAULT_TRAITS: PersonalityTraits = {
  warmth: 0.5,
  assertiveness: 0.5,
  formality: 0.5,
  humor: 0.3,
  directness: 0.5,
  empathy: 0.5,
  risk_tolerance: 0.5,
  creativity: 0.5,
  precision: 0.5,
  verbosity: 0.5,
  tempo: 0.5,
  authority_gradient: 0.5,
};

export const useStudioStore = create<StudioState>((set) => ({
  agentId: null,
  agentName: "",
  traits: { ...DEFAULT_TRAITS },
  facets: {},
  signatures: { tone_palette: [], taboo_tones: [] },
  preferences: {
    output_format: "mixed",
    bullet_density: "moderate",
    emoji_policy: "sparingly",
    reasoning_transparency: "on_request",
    citation_behavior: "none",
    decision_mode: "recommend_with_tradeoffs",
  },
  activeTab: "chat",
  selectedProvider: "anthropic",
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,

  setAgentId: (id) => set({ agentId: id }),
  setAgentName: (name) => set({ agentName: name }),

  setTrait: (dimension, value) =>
    set((state) => ({
      traits: { ...state.traits, [dimension]: value },
      isDirty: true,
    })),

  setTraits: (traits) =>
    set((state) => ({
      traits: { ...state.traits, ...traits },
      isDirty: true,
    })),

  setFacets: (facets) =>
    set((state) => ({
      facets: { ...state.facets, ...facets },
      isDirty: true,
    })),

  setSignatures: (signatures) =>
    set((state) => ({
      signatures: { ...state.signatures, ...signatures },
      isDirty: true,
    })),

  setPreferences: (preferences) =>
    set((state) => ({
      preferences: { ...state.preferences, ...preferences },
      isDirty: true,
    })),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedProvider: (provider) => set({ selectedProvider: provider }),

  loadVector: (data) =>
    set({
      agentId: data.agentId,
      agentName: data.agentName,
      traits: data.traits,
      facets: data.facets,
      signatures: data.signatures,
      preferences: data.preferences,
      isDirty: false,
      lastSavedAt: new Date(),
    }),

  loadArchetype: (archetype) =>
    set((state) => ({
      traits: { ...ARCHETYPES[archetype].traits },
      signatures: { ...state.signatures, archetype },
      isDirty: true,
    })),

  markSaving: () => set({ isSaving: true }),
  markSaved: () => set({ isSaving: false, isDirty: false, lastSavedAt: new Date() }),
  markDirty: () => set({ isDirty: true }),

  reset: () =>
    set({
      traits: { ...DEFAULT_TRAITS },
      facets: {},
      signatures: { tone_palette: [], taboo_tones: [] },
      preferences: {
        output_format: "mixed",
        bullet_density: "moderate",
        emoji_policy: "sparingly",
        reasoning_transparency: "on_request",
        citation_behavior: "none",
        decision_mode: "recommend_with_tradeoffs",
      },
      isDirty: false,
    }),
}));
