/**
 * LeRobot Integration — bridges holomime personality to HuggingFace LeRobot
 * policy framework. Maps Big Five personality traits to policy parameters.
 *
 * LeRobot (https://github.com/huggingface/lerobot) is HuggingFace's framework
 * for real-world robot learning. This adapter maps holomime personality
 * dimensions to LeRobot policy parameter overrides and exports DPO training
 * data in LeRobot-compatible dataset format.
 */

import type { PersonalitySpec, BigFive } from "../core/types.js";
import type { DPOPair } from "../analysis/training-export.js";
import type { SimDPOPair } from "../simulation/sim-therapy.js";
import { mapPersonalityToPolicy, type PolicyOverrides } from "./lerobot-personality-mapper.js";

// ─── Configuration ──────────────────────────────────────────

export interface LeRobotConfig {
  /** HuggingFace model ID for LeRobot policy (e.g., "lerobot/act_aloha_sim"). */
  modelId?: string;
  /** HuggingFace Hub token for pushing datasets. */
  hubToken?: string;
}

// ─── LeRobot Dataset Types ──────────────────────────────────

/**
 * A single episode in LeRobot dataset format.
 * LeRobot uses Parquet files with episode_index and frame_index columns.
 */
export interface LeRobotEpisode {
  episode_index: number;
  frames: LeRobotFrame[];
}

export interface LeRobotFrame {
  frame_index: number;
  timestamp: number;
  observation_state: number[];
  action: number[];
  reward: number;
  done: boolean;
  /** HoloMime personality-driven policy overrides applied to this frame. */
  policy_overrides?: PolicyOverrides;
}

/**
 * LeRobot dataset metadata (info.json).
 */
export interface LeRobotDatasetInfo {
  fps: number;
  robot_type: string;
  total_episodes: number;
  total_frames: number;
  features: Record<string, { dtype: string; shape: number[] }>;
  holomime?: {
    agent_name: string;
    personality_hash: string;
    policy_overrides: PolicyOverrides;
  };
}

// ─── LeRobot Adapter ────────────────────────────────────────

export class LeRobotAdapter {
  private readonly modelId: string | undefined;
  private readonly hubToken: string | undefined;

  constructor(config: LeRobotConfig = {}) {
    this.modelId = config.modelId;
    this.hubToken = config.hubToken;
  }

  /**
   * Map a personality spec to LeRobot policy parameter overrides.
   * Each Big Five dimension maps to a specific physical behavior modification.
   */
  mapPersonalityToPolicy(spec: PersonalitySpec): PolicyOverrides {
    return mapPersonalityToPolicy(spec.big_five);
  }

  /**
   * Export DPO pairs (from therapy or sim) to LeRobot-compatible dataset format.
   *
   * LeRobot datasets use Parquet files with episode structure. This method
   * produces the JSON representation that can be converted to Parquet
   * (via Python's pyarrow or the LeRobot dataset tools).
   *
   * Each DPO pair becomes two episodes:
   *   - even index: chosen (preferred behavior)
   *   - odd index: rejected (drifted behavior)
   */
  exportDPOAsLeRobotDataset(
    pairs: (DPOPair | SimDPOPair)[],
    outputPath: string,
  ): LeRobotDatasetExport {
    const episodes: LeRobotEpisode[] = [];
    let episodeIndex = 0;

    for (const pair of pairs) {
      // Chosen episode (preferred behavior)
      episodes.push({
        episode_index: episodeIndex++,
        frames: this.textToFrames(pair.chosen, 1.0),
      });

      // Rejected episode (drifted behavior)
      episodes.push({
        episode_index: episodeIndex++,
        frames: this.textToFrames(pair.rejected, -1.0),
      });
    }

    const totalFrames = episodes.reduce((sum, ep) => sum + ep.frames.length, 0);

    const info: LeRobotDatasetInfo = {
      fps: 30,
      robot_type: "humanoid",
      total_episodes: episodes.length,
      total_frames: totalFrames,
      features: {
        observation_state: { dtype: "float32", shape: [376] },
        action: { dtype: "float32", shape: [17] },
        reward: { dtype: "float32", shape: [1] },
        done: { dtype: "bool", shape: [1] },
      },
      holomime: this.modelId ? {
        agent_name: pairs[0]?.metadata?.agent ?? "unknown",
        personality_hash: "",
        policy_overrides: mapPersonalityToPolicy({
          openness: { score: 0.5, facets: { imagination: 0.5, intellectual_curiosity: 0.5, aesthetic_sensitivity: 0.5, willingness_to_experiment: 0.5 } },
          conscientiousness: { score: 0.5, facets: { self_discipline: 0.5, orderliness: 0.5, goal_orientation: 0.5, attention_to_detail: 0.5 } },
          extraversion: { score: 0.5, facets: { assertiveness: 0.5, enthusiasm: 0.5, sociability: 0.5, initiative: 0.5 } },
          agreeableness: { score: 0.5, facets: { warmth: 0.5, empathy: 0.5, cooperation: 0.5, trust_tendency: 0.5 } },
          emotional_stability: { score: 0.5, facets: { stress_tolerance: 0.5, emotional_regulation: 0.5, confidence: 0.5, adaptability: 0.5 } },
        }),
      } : undefined,
    };

    return {
      outputPath,
      info,
      episodes,
    };
  }

  /**
   * Push a LeRobot dataset to HuggingFace Hub.
   * Uploads the dataset JSON as a Parquet-compatible file.
   */
  async pushToHub(
    datasetPath: string,
    repoId: string,
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.hubToken) {
      return { success: false, error: "No HuggingFace Hub token provided" };
    }

    try {
      // Create dataset repo (if it doesn't exist)
      const createRes = await fetch("https://huggingface.co/api/repos/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.hubToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: repoId.split("/").pop(),
          type: "dataset",
          private: false,
        }),
      });

      // 409 = already exists, which is fine
      if (!createRes.ok && createRes.status !== 409) {
        const errText = await createRes.text();
        return { success: false, error: `Failed to create repo: ${createRes.status} ${errText}` };
      }

      // Upload the dataset file
      const uploadRes = await fetch(
        `https://huggingface.co/api/datasets/${repoId}/upload/main/data/train.jsonl`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.hubToken}`,
            "Content-Type": "application/octet-stream",
          },
          body: datasetPath,
        },
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return { success: false, error: `Failed to upload: ${uploadRes.status} ${errText}` };
      }

      return {
        success: true,
        url: `https://huggingface.co/datasets/${repoId}`,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ─── Internal Helpers ──────────────────────────────────────

  /**
   * Convert text-based DPO content to a synthetic frame sequence.
   * In a production system, these would be actual recorded trajectories.
   * For now, we create placeholder frames that encode the preference signal.
   */
  private textToFrames(text: string, reward: number): LeRobotFrame[] {
    // Generate a minimal episode with the reward signal
    const frameCount = Math.max(10, Math.min(100, text.length / 10));
    const frames: LeRobotFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      frames.push({
        frame_index: i,
        timestamp: i / 30, // 30 fps
        observation_state: new Array(376).fill(0),
        action: new Array(17).fill(0),
        reward: i === frameCount - 1 ? reward : 0, // Sparse reward at end
        done: i === frameCount - 1,
      });
    }

    return frames;
  }
}

// ─── Export Types ────────────────────────────────────────────

export interface LeRobotDatasetExport {
  outputPath: string;
  info: LeRobotDatasetInfo;
  episodes: LeRobotEpisode[];
}
