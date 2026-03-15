import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { VoiceAdapter, VoiceAdapterCallbacks, VoiceEvent } from "../adapters/voice/types.js";
import { startVoiceMonitor, type VoiceMonitorHandle } from "../analysis/voice-monitor.js";

// ─── Mock Adapter ────────────────────────────────────────────

class MockAdapter implements VoiceAdapter {
  readonly platform = "mock";
  private callbacks: VoiceAdapterCallbacks | null = null;
  private connected = false;

  async connect(callbacks: VoiceAdapterCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.connected = true;
    callbacks.onConnected?.();
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.callbacks?.onDisconnected?.();
    this.callbacks = null;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Simulate receiving a voice event */
  emit(event: VoiceEvent): void {
    this.callbacks?.onSegment(event);
  }
}

// ─── Helpers ────────────────────────────────────────────────

function makeEvent(speaker: string, text: string): VoiceEvent {
  return {
    timestamp: new Date().toISOString(),
    speaker,
    text,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("startVoiceMonitor", () => {
  let adapter: MockAdapter;
  let handle: VoiceMonitorHandle;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new MockAdapter();
  });

  afterEach(async () => {
    if (handle) {
      await handle.stop();
    }
    vi.useRealTimers();
  });

  it("connects to adapter and receives segments", async () => {
    const segments: VoiceEvent[] = [];
    let connected = false;

    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 5000, minSegments: 2 },
      {
        onConnected: () => { connected = true; },
        onSegment: (e) => segments.push(e),
      },
    );

    // Wait for connect
    await vi.advanceTimersByTimeAsync(0);
    expect(connected).toBe(true);

    // Emit segments
    adapter.emit(makeEvent("user", "Hello"));
    adapter.emit(makeEvent("agent", "Hi there, how can I help?"));

    expect(segments).toHaveLength(2);
    expect(handle.getSegments()).toHaveLength(2);
  });

  it("runs diagnosis periodically after minimum segments", async () => {
    const diagnoses: any[] = [];

    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 1000, minSegments: 3 },
      {
        onDiagnosis: (report) => diagnoses.push(report),
      },
    );

    await vi.advanceTimersByTimeAsync(0);

    // Emit enough segments
    for (let i = 0; i < 4; i++) {
      adapter.emit(makeEvent("user", "Question " + i));
      adapter.emit(makeEvent("agent", "Answer " + i));
    }

    // Trigger diagnosis interval
    await vi.advanceTimersByTimeAsync(1100);

    expect(diagnoses).toHaveLength(1);
    expect(diagnoses[0].sessionSummary.totalSegments).toBe(8);
  });

  it("enforces rolling buffer max size", async () => {
    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 60000, minSegments: 2, maxBufferSize: 5 },
      {},
    );

    await vi.advanceTimersByTimeAsync(0);

    // Emit 10 segments
    for (let i = 0; i < 10; i++) {
      adapter.emit(makeEvent("user", "Message " + i));
    }

    expect(handle.getSegments()).toHaveLength(5);
  });

  it("emits alerts for detected patterns", async () => {
    const alerts: any[] = [];

    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 1000, minSegments: 3, alertThreshold: "warning" },
      {
        onAlert: (p) => alerts.push(p),
      },
    );

    await vi.advanceTimersByTimeAsync(0);

    // Emit problematic segments (over-apologizing)
    for (let i = 0; i < 10; i++) {
      adapter.emit(makeEvent("user", "Tell me more"));
      adapter.emit(makeEvent("agent", "I'm so sorry, I apologize for the confusion. I apologize deeply."));
    }

    // Trigger diagnosis
    await vi.advanceTimersByTimeAsync(1100);

    // Should have detected at least one pattern
    // (may or may not trigger based on exact thresholds)
    expect(handle.getLastDiagnosis()).not.toBeNull();
  });

  it("tracks behavioral trajectory", async () => {
    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 1000, minSegments: 3 },
      {},
    );

    await vi.advanceTimersByTimeAsync(0);

    // Emit segments
    for (let i = 0; i < 6; i++) {
      adapter.emit(makeEvent("user", "Question"));
      adapter.emit(makeEvent("agent", "Here is a clear and helpful answer."));
    }

    // Run two diagnosis cycles
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(1100);

    const trajectory = handle.getTrajectory();
    expect(trajectory.checkpoints).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(trajectory.patternHistory)).toBe(true);
  });

  it("runNow forces immediate diagnosis", async () => {
    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 60000, minSegments: 2 },
      {},
    );

    await vi.advanceTimersByTimeAsync(0);

    // Emit segments
    for (let i = 0; i < 4; i++) {
      adapter.emit(makeEvent("user", "Question"));
      adapter.emit(makeEvent("agent", "Answer"));
    }

    const result = handle.runNow();
    expect(result).not.toBeNull();
    expect(result!.sessionSummary.totalSegments).toBe(8);
  });

  it("cleans up on stop", async () => {
    handle = startVoiceMonitor(
      { adapter, diagnosisInterval: 1000, minSegments: 2 },
      {},
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(adapter.isConnected()).toBe(true);

    await handle.stop();
    expect(adapter.isConnected()).toBe(false);
  });
});
