/**
 * Custom detector engine for enterprise customers.
 * Executes user-defined detectors (regex, keyword, threshold) against message arrays.
 */

export interface CustomDetectorResult {
  id: string;
  name: string;
  severity: "info" | "warning" | "concern";
  count: number;
  percentage: number;
  description: string;
  examples: string[];
}

export interface DetectorConfig {
  id: string;
  name: string;
  detection_type: string;
  config: Record<string, unknown>;
  severity: "info" | "warning" | "concern";
}

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

function runRegexDetector(detector: DetectorConfig, assistantMsgs: Message[]): CustomDetectorResult | null {
  const patterns = (detector.config.patterns as string[]) ?? [];
  if (patterns.length === 0) return null;

  const compiled = patterns.map(p => new RegExp(p, "i"));
  let count = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    if (compiled.some(re => re.test(msg.content))) {
      count++;
      if (examples.length < 3) examples.push(msg.content.slice(0, 120));
    }
  }

  if (count === 0) return null;

  const percentage = assistantMsgs.length > 0 ? Math.round((count / assistantMsgs.length) * 100) : 0;

  return {
    id: detector.id,
    name: detector.name,
    severity: detector.severity,
    count,
    percentage,
    description: `Matched in ${percentage}% of assistant responses (${count}/${assistantMsgs.length}).`,
    examples,
  };
}

function runKeywordDetector(detector: DetectorConfig, assistantMsgs: Message[]): CustomDetectorResult | null {
  const keywords = (detector.config.keywords as string[]) ?? [];
  if (keywords.length === 0) return null;

  const lower = keywords.map(k => k.toLowerCase());
  let count = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    const content = msg.content.toLowerCase();
    if (lower.some(kw => content.includes(kw))) {
      count++;
      if (examples.length < 3) examples.push(msg.content.slice(0, 120));
    }
  }

  if (count === 0) return null;

  const percentage = assistantMsgs.length > 0 ? Math.round((count / assistantMsgs.length) * 100) : 0;

  return {
    id: detector.id,
    name: detector.name,
    severity: detector.severity,
    count,
    percentage,
    description: `Keyword match in ${percentage}% of assistant responses (${count}/${assistantMsgs.length}).`,
    examples,
  };
}

function countSentences(text: string): number {
  const matches = text.match(/[.!?]+/g);
  return matches ? matches.length : 0;
}

function runThresholdDetector(detector: DetectorConfig, assistantMsgs: Message[]): CustomDetectorResult | null {
  const field = detector.config.field as "word_count" | "sentence_count";
  const min = detector.config.min as number | undefined;
  const max = detector.config.max as number | undefined;

  if (!field) return null;

  let count = 0;
  const examples: string[] = [];

  for (const msg of assistantMsgs) {
    let value: number;
    if (field === "word_count") {
      value = msg.content.split(/\s+/).filter(Boolean).length;
    } else {
      value = countSentences(msg.content);
    }

    const belowMin = min !== undefined && value < min;
    const aboveMax = max !== undefined && value > max;

    if (belowMin || aboveMax) {
      count++;
      if (examples.length < 3) examples.push(msg.content.slice(0, 120));
    }
  }

  if (count === 0) return null;

  const percentage = assistantMsgs.length > 0 ? Math.round((count / assistantMsgs.length) * 100) : 0;

  return {
    id: detector.id,
    name: detector.name,
    severity: detector.severity,
    count,
    percentage,
    description: `${percentage}% of responses outside ${field} bounds (${count}/${assistantMsgs.length}).`,
    examples,
  };
}

export function runCustomDetectors(detectors: DetectorConfig[], messages: Message[]): CustomDetectorResult[] {
  const assistantMsgs = messages.filter(m => m.role === "assistant");
  if (assistantMsgs.length === 0) return [];

  const results: CustomDetectorResult[] = [];

  for (const detector of detectors) {
    let result: CustomDetectorResult | null = null;

    switch (detector.detection_type) {
      case "regex":
        result = runRegexDetector(detector, assistantMsgs);
        break;
      case "keyword":
        result = runKeywordDetector(detector, assistantMsgs);
        break;
      case "threshold":
        result = runThresholdDetector(detector, assistantMsgs);
        break;
    }

    if (result) results.push(result);
  }

  return results;
}
