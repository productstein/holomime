/**
 * Model Router — task-based model assignment.
 * Inspired by DeerFlow's multi-model abstraction.
 *
 * Assigns different LLM models to different tasks:
 *   therapy-analysis → claude-opus (deep reasoning)
 *   summarization → gpt-4o-mini (fast, cheap)
 *   conscience-enforcement → claude-haiku (fast, reliable)
 */

export interface ModelConfig {
  default: string;
  tasks: Record<string, {
    model: string;
    temperature?: number;
    maxTokens?: number;
  }>;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  default: "claude-3-5-sonnet",
  tasks: {
    "therapy-analysis": { model: "claude-3-5-sonnet", temperature: 0.3 },
    "therapy-session": { model: "claude-3-5-sonnet", temperature: 0.7 },
    "summarization": { model: "gpt-4o-mini", temperature: 0.2, maxTokens: 500 },
    "memory-extraction": { model: "gpt-4o-mini", temperature: 0.1 },
    "conscience-enforcement": { model: "claude-3-5-haiku", temperature: 0 },
    "drift-detection": { model: "claude-3-5-haiku", temperature: 0.1 },
    "fleet-orchestration": { model: "claude-3-5-sonnet", temperature: 0.3 },
  },
};

export class ModelRouter {
  private config: ModelConfig;

  constructor(config?: Partial<ModelConfig>) {
    this.config = {
      ...DEFAULT_MODEL_CONFIG,
      ...config,
      tasks: { ...DEFAULT_MODEL_CONFIG.tasks, ...config?.tasks },
    };
  }

  /**
   * Get model config for a specific task.
   */
  getModelForTask(taskName: string): { model: string; temperature: number; maxTokens?: number } {
    const taskConfig = this.config.tasks[taskName];
    if (taskConfig) {
      return {
        model: taskConfig.model,
        temperature: taskConfig.temperature ?? 0.3,
        maxTokens: taskConfig.maxTokens,
      };
    }
    return { model: this.config.default, temperature: 0.3 };
  }

  /**
   * List all configured task assignments.
   */
  listAssignments(): Array<{ task: string; model: string }> {
    return Object.entries(this.config.tasks).map(([task, cfg]) => ({
      task,
      model: cfg.model,
    }));
  }

  /**
   * Override model for a specific task at runtime.
   */
  override(taskName: string, model: string, temperature?: number): void {
    this.config.tasks[taskName] = {
      model,
      temperature: temperature ?? this.config.tasks[taskName]?.temperature ?? 0.3,
    };
  }
}
