/**
 * holomime SDK — Personality engine for AI agents
 *
 * @example
 * ```typescript
 * import { holomime } from '@holomime/sdk';
 *
 * const holo = new holomime({ apiKey: 'mk_...' });
 *
 * // Load a personality
 * const vector = await holo.vectors.get('my-sales-agent');
 *
 * // Compile for a specific provider
 * const compiled = await holo.compile({
 *   agentId: vector.agent_id,
 *   provider: 'anthropic',
 *   surface: 'chat',
 * });
 *
 * // Use the compiled config with any LLM SDK
 * // compiled.system_prompt, compiled.temperature, compiled.max_tokens
 * ```
 */

export interface holomimeConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface PersonalityTraits {
  warmth: number;
  assertiveness: number;
  formality: number;
  humor: number;
  directness: number;
  empathy: number;
  risk_tolerance: number;
  creativity: number;
  precision: number;
  verbosity: number;
  tempo: number;
  authority_gradient: number;
}

export interface PersonalityVector {
  id: string;
  agent_id: string;
  version: number;
  traits: PersonalityTraits;
  facets: Record<string, string>;
  signatures: Record<string, unknown>;
  preferences: Record<string, unknown>;
  hash: string;
  created_at: string;
}

export interface CompiledConfig {
  provider: string;
  surface: string;
  system_prompt: string;
  temperature: number;
  top_p: number;
  max_tokens: number;
  metadata: {
    vector_hash: string;
    compiled_at: string;
    archetype?: string;
  };
}

export interface Agent {
  id: string;
  name: string;
  handle: string;
  description?: string;
  is_public: boolean;
  current_vector_id: string | null;
  created_at: string;
}

export interface CompileInput {
  agentId?: string;
  vectorId?: string;
  provider: "anthropic" | "openai" | "gemini" | "ollama";
  surface?: "chat" | "email" | "code_review" | "slack" | "api";
}

export interface TelemetryEvent {
  agent_id: string;
  event: string;
  metadata?: Record<string, unknown>;
}

export interface HealthScore {
  agent_id: string;
  overall: number;
  consistency: number;
  policy_compliance: number;
  performance_score: number;
  drift_level: string;
}

export class holomime {
  private apiKey: string;
  private baseUrl: string;

  public vectors: Vectors;
  public agents: Agents;
  public telemetry: Telemetry;
  public eval: Eval;

  constructor(config: holomimeConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.holomime.com/v1";

    this.vectors = new Vectors(this);
    this.agents = new Agents(this);
    this.telemetry = new Telemetry(this);
    this.eval = new Eval(this);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new holomimeError(res.status, error.message ?? "API request failed");
    }

    return res.json();
  }

  /**
   * Compile a personality vector for a specific provider and surface.
   */
  async compile(input: CompileInput): Promise<CompiledConfig> {
    return this.request<CompiledConfig>("POST", "/compile", input);
  }
}

class Vectors {
  constructor(private client: holomime) {}

  async get(idOrHandle: string): Promise<PersonalityVector> {
    return this.client.request("GET", `/vectors/${idOrHandle}`);
  }

  async list(agentId: string): Promise<PersonalityVector[]> {
    return this.client.request("GET", `/vectors?agent_id=${agentId}`);
  }

  async create(agentId: string, traits: Partial<PersonalityTraits>): Promise<PersonalityVector> {
    return this.client.request("POST", "/vectors", { agent_id: agentId, traits });
  }

  async update(agentId: string, traits: Partial<PersonalityTraits>): Promise<PersonalityVector> {
    return this.client.request("PATCH", `/vectors/${agentId}`, { traits });
  }

  async fork(sourceAgentId: string, name: string, handle: string): Promise<Agent> {
    return this.client.request("POST", `/vectors/${sourceAgentId}/fork`, { name, handle });
  }

  async diff(vectorAId: string, vectorBId: string): Promise<unknown> {
    return this.client.request("GET", `/vectors/${vectorAId}/diff/${vectorBId}`);
  }
}

class Agents {
  constructor(private client: holomime) {}

  async get(idOrHandle: string): Promise<Agent> {
    return this.client.request("GET", `/agents/${idOrHandle}`);
  }

  async list(): Promise<Agent[]> {
    return this.client.request("GET", "/agents");
  }

  async create(input: { name: string; handle: string; description?: string; archetype?: string }): Promise<Agent> {
    return this.client.request("POST", "/agents", input);
  }
}

class Telemetry {
  constructor(private client: holomime) {}

  async report(event: TelemetryEvent): Promise<void> {
    await this.client.request("POST", "/telemetry/events", event);
  }

  async reportBatch(events: TelemetryEvent[]): Promise<void> {
    await this.client.request("POST", "/telemetry/events/batch", { events });
  }

  async getHealth(agentId: string): Promise<HealthScore> {
    return this.client.request("GET", `/telemetry/health/${agentId}`);
  }
}

class Eval {
  constructor(private client: holomime) {}

  async run(suiteId: string, vectorId: string): Promise<{ runId: string }> {
    return this.client.request("POST", "/eval/run", { suite_id: suiteId, vector_id: vectorId });
  }

  async getResults(runId: string): Promise<unknown> {
    return this.client.request("GET", `/eval/runs/${runId}`);
  }

  async listSuites(): Promise<unknown[]> {
    return this.client.request("GET", "/eval/suites");
  }
}

export class holomimeError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "holomimeError";
  }
}

export default holomime;
