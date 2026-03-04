/**
 * Oversight — human gating controls for autonomous operations.
 *
 * Four modes control how much human approval is required:
 * - none: fully autonomous, no blocking
 * - review: log + notify, no blocking (default)
 * - approve: block on every action, require human approval
 * - approve-specs: block only on .personality.json writes
 */

// ─── Types ──────────────────────────────────────────────────

export type OversightMode = "none" | "review" | "approve" | "approve-specs";

export type OversightAction =
  | "spec-writes"
  | "training-export"
  | "network-therapy";

export type OversightNotification =
  | "drift"
  | "session"
  | "spec-change"
  | "dpo-export";

export interface OversightPolicy {
  mode: OversightMode;
  notifyOn: OversightNotification[];
  requireApprovalFor: OversightAction[];
  maxAutonomousIterations: number;
}

// ─── Defaults ───────────────────────────────────────────────

export const DEFAULT_OVERSIGHT: OversightPolicy = {
  mode: "review",
  notifyOn: ["drift", "session", "spec-change", "dpo-export"],
  requireApprovalFor: ["spec-writes"],
  maxAutonomousIterations: 5,
};

const MODE_APPROVAL_MAP: Record<OversightMode, OversightAction[]> = {
  none: [],
  review: [],
  "approve-specs": ["spec-writes"],
  approve: ["spec-writes", "training-export", "network-therapy"],
};

// ─── Resolution ─────────────────────────────────────────────

/**
 * Merge partial oversight flags with defaults.
 * Mode determines the base approval requirements, which can be extended.
 */
export function resolveOversight(
  flags: Partial<OversightPolicy>,
): OversightPolicy {
  const mode = flags.mode ?? DEFAULT_OVERSIGHT.mode;
  const modeApprovals = MODE_APPROVAL_MAP[mode];

  // Merge mode-based approvals with any explicit requireApprovalFor
  const approvals = new Set([
    ...modeApprovals,
    ...(flags.requireApprovalFor ?? []),
  ]);

  return {
    mode,
    notifyOn: flags.notifyOn ?? DEFAULT_OVERSIGHT.notifyOn,
    requireApprovalFor: Array.from(approvals) as OversightAction[],
    maxAutonomousIterations:
      flags.maxAutonomousIterations ?? DEFAULT_OVERSIGHT.maxAutonomousIterations,
  };
}

// ─── Approval Check ─────────────────────────────────────────

/**
 * Check if an action is approved under the given policy.
 * Returns { approved: true } if no approval needed,
 * or { approved: false, reason } if the action requires human approval.
 */
export function checkApproval(
  action: OversightAction,
  policy: OversightPolicy,
): { approved: boolean; reason?: string } {
  if (policy.mode === "none") {
    return { approved: true };
  }

  if (policy.requireApprovalFor.includes(action)) {
    return {
      approved: false,
      reason: `Action "${action}" requires human approval (oversight mode: ${policy.mode})`,
    };
  }

  return { approved: true };
}

/**
 * Check if the iteration limit has been reached.
 */
export function checkIterationBudget(
  currentIteration: number,
  policy: OversightPolicy,
): { withinBudget: boolean; limit: number } {
  return {
    withinBudget: currentIteration < policy.maxAutonomousIterations,
    limit: policy.maxAutonomousIterations,
  };
}
