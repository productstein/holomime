/**
 * HuggingFace Export — convert training data to HF Hub format and push.
 *
 * Converts DPO pairs to TRL DPO format (chosen/rejected as message arrays)
 * and SFT data to messages format. Pushes directly to HF Hub via API.
 */

import type { TrainingExport, DPOPair, AlpacaExample } from "./training-export.js";

// ─── Types ──────────────────────────────────────────────────

export interface HFPushOptions {
  repo: string;
  token: string;
  filename?: string;
  private?: boolean;
}

export interface HFPushResult {
  success: boolean;
  url?: string;
  error?: string;
}

// ─── Format Conversion ──────────────────────────────────────

/**
 * Convert training export to HuggingFace-compatible JSONL format.
 *
 * DPO format: { prompt, chosen: [{role, content}], rejected: [{role, content}] }
 * SFT format: { messages: [{role, content}] }
 */
export function convertToHFFormat(data: TrainingExport): string {
  const lines: string[] = [];

  if (data.format === "dpo") {
    for (const example of data.examples as DPOPair[]) {
      lines.push(JSON.stringify({
        prompt: example.prompt,
        chosen: [
          { role: "user", content: example.prompt },
          { role: "assistant", content: example.chosen },
        ],
        rejected: [
          { role: "user", content: example.prompt },
          { role: "assistant", content: example.rejected },
        ],
      }));
    }
  } else {
    // SFT/Alpaca/RLHF → messages format
    for (const example of data.examples as AlpacaExample[]) {
      const messages: Array<{ role: string; content: string }> = [];
      if ("instruction" in example) {
        messages.push({ role: "system", content: (example as AlpacaExample).instruction });
        if ((example as AlpacaExample).input) {
          messages.push({ role: "user", content: (example as AlpacaExample).input });
        }
        messages.push({ role: "assistant", content: (example as AlpacaExample).output });
      } else if ("response" in example) {
        // RLHF format
        const rlhf = example as any;
        messages.push({ role: "user", content: rlhf.prompt });
        messages.push({ role: "assistant", content: rlhf.response });
      }
      if (messages.length > 0) {
        lines.push(JSON.stringify({ messages }));
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ─── HuggingFace Hub Push ───────────────────────────────────

/**
 * Push JSONL data to HuggingFace Hub.
 * Uses the HF Hub API directly via native fetch (no Python/SDK dependency).
 */
export async function pushToHFHub(jsonl: string, options: HFPushOptions): Promise<HFPushResult> {
  const { repo, token, filename = "train.jsonl" } = options;

  try {
    // Step 1: Create the repo (if it doesn't exist)
    const createRes = await fetch(`https://huggingface.co/api/repos/create`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repo.split("/").pop(),
        type: "dataset",
        private: options.private ?? false,
      }),
    });

    // 409 = repo already exists, which is fine
    if (!createRes.ok && createRes.status !== 409) {
      const errText = await createRes.text();
      return { success: false, error: `Failed to create repo: ${createRes.status} ${errText}` };
    }

    // Step 2: Upload the file
    const uploadRes = await fetch(
      `https://huggingface.co/api/datasets/${repo}/upload/main/${filename}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: jsonl,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return { success: false, error: `Failed to upload: ${uploadRes.status} ${errText}` };
    }

    return {
      success: true,
      url: `https://huggingface.co/datasets/${repo}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
