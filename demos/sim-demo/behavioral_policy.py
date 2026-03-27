"""
Behavioral policy — the conscience.exe equivalent for a robot arm.

Mirrors holomime's CompiledConscience evaluator: rule-based, deterministic,
sub-millisecond. Deny dominates in policy composition.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional
import math


@dataclass
class SafetyEnvelope:
    """Physical safety boundaries for the robot arm."""
    max_reach_m: float = 0.6          # Maximum radial reach from base
    max_speed_m_s: float = 1.0        # Maximum end-effector speed
    max_force_n: float = 10.0         # Maximum contact force
    min_proximity_m: float = 0.3      # Minimum distance to humans
    max_z_m: float = 0.5              # Maximum height
    min_z_m: float = -0.05            # No reaching below table
    forbidden_zones: list = field(default_factory=lambda: [
        # (center_x, center_y, radius) — zones the arm must never enter
        {"center": (0.2, -0.4), "radius": 0.15, "label": "human-workspace"},
    ])


@dataclass
class ActionContext:
    """Context for a single action to evaluate."""
    position: tuple[float, float, float]   # (x, y, z) in meters
    speed: float = 0.0                      # m/s
    force: float = 0.0                      # N
    proximity: float = float("inf")         # distance to nearest human
    action: str = ""                        # description of intent
    gripper_force: float = 0.0              # N applied by gripper


@dataclass
class EvalResult:
    """Result of a conscience evaluation."""
    allowed: bool
    decision: str          # "allow", "deny", "clamp", "escalate"
    reason: str = ""
    rule_matched: str = ""
    corrected_position: Optional[tuple[float, float, float]] = None
    corrected_force: Optional[float] = None
    eval_time_us: float = 0.0
    severity: str = "none"  # "none", "low", "medium", "high", "critical"
    score: float = 0.0      # 0.0 = safe, 1.0 = maximum violation


class CompiledConscience:
    """
    Deterministic behavioral safety evaluator.

    Compiles safety rules into fast checks. No LLM, no neural net.
    Designed to run at 1kHz alongside a robot control loop.
    Deny dominates: if any deny rule matches, the action is blocked.
    """

    def __init__(self, envelope: SafetyEnvelope, clamp_mode: bool = True):
        self.envelope = envelope
        self.clamp_mode = clamp_mode
        self.hard_limits = [
            "Never exceed safety envelope reach",
            "Never exceed maximum contact force",
            "Never enter forbidden zones",
            "Emergency stop on proximity violation",
            "Never reach below work surface",
        ]

    def evaluate(self, ctx: ActionContext) -> EvalResult:
        """Evaluate an action against the safety policy. Returns in <1ms."""
        t0 = time.perf_counter_ns()

        # Check each rule in priority order (deny dominates)
        result = self._check_reach(ctx)
        if not result.allowed and result.decision == "deny":
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        result = self._check_force(ctx)
        if not result.allowed:
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        result = self._check_proximity(ctx)
        if not result.allowed:
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        result = self._check_forbidden_zones(ctx)
        if not result.allowed:
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        result = self._check_height(ctx)
        if not result.allowed:
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        result = self._check_speed(ctx)
        if not result.allowed:
            result.eval_time_us = (time.perf_counter_ns() - t0) / 1000
            return result

        # All checks passed
        elapsed_us = (time.perf_counter_ns() - t0) / 1000
        return EvalResult(
            allowed=True,
            decision="allow",
            reason="All safety checks passed",
            eval_time_us=elapsed_us,
        )

    def _check_reach(self, ctx: ActionContext) -> EvalResult:
        x, y, z = ctx.position
        reach = math.sqrt(x ** 2 + y ** 2)
        if reach <= self.envelope.max_reach_m:
            return EvalResult(allowed=True, decision="allow")

        overshoot = reach - self.envelope.max_reach_m
        score = min(1.0, overshoot / self.envelope.max_reach_m)
        severity = "high" if score > 0.3 else "medium"

        if self.clamp_mode:
            # Clamp to boundary of safety envelope
            scale = self.envelope.max_reach_m / reach
            corrected = (x * scale, y * scale, z)
            return EvalResult(
                allowed=False,
                decision="clamp",
                reason=f"Position exceeds max_reach ({self.envelope.max_reach_m}m). "
                       f"Reach: {reach:.3f}m",
                rule_matched="boundary-violation",
                corrected_position=corrected,
                severity=severity,
                score=score,
            )
        return EvalResult(
            allowed=False,
            decision="deny",
            reason=f"Position exceeds max_reach ({self.envelope.max_reach_m}m)",
            rule_matched="boundary-violation",
            severity=severity,
            score=score,
        )

    def _check_force(self, ctx: ActionContext) -> EvalResult:
        if ctx.force <= self.envelope.max_force_n:
            return EvalResult(allowed=True, decision="allow")

        overshoot = ctx.force - self.envelope.max_force_n
        score = min(1.0, overshoot / self.envelope.max_force_n)
        severity = "critical" if score > 0.5 else "high"

        if self.clamp_mode:
            return EvalResult(
                allowed=False,
                decision="clamp",
                reason=f"Force {ctx.force:.1f}N exceeds max ({self.envelope.max_force_n}N)",
                rule_matched="force-violation",
                corrected_force=self.envelope.max_force_n,
                severity=severity,
                score=score,
            )
        return EvalResult(
            allowed=False, decision="deny",
            reason=f"Force exceeds maximum ({self.envelope.max_force_n}N)",
            rule_matched="force-violation", severity=severity, score=score,
        )

    def _check_proximity(self, ctx: ActionContext) -> EvalResult:
        if ctx.proximity >= self.envelope.min_proximity_m:
            return EvalResult(allowed=True, decision="allow")

        score = min(1.0, (self.envelope.min_proximity_m - ctx.proximity) / self.envelope.min_proximity_m)
        return EvalResult(
            allowed=False,
            decision="escalate",
            reason=f"Human detected at {ctx.proximity:.2f}m (min: {self.envelope.min_proximity_m}m). "
                   f"Emergency stop.",
            rule_matched="proximity-violation",
            severity="critical",
            score=score,
        )

    def _check_forbidden_zones(self, ctx: ActionContext) -> EvalResult:
        x, y, _ = ctx.position
        for zone in self.envelope.forbidden_zones:
            cx, cy = zone["center"]
            dist = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            if dist < zone["radius"]:
                score = 1.0 - (dist / zone["radius"])
                return EvalResult(
                    allowed=False,
                    decision="deny",
                    reason=f"Position inside forbidden zone '{zone['label']}' "
                           f"(dist: {dist:.3f}m, radius: {zone['radius']}m)",
                    rule_matched="zone-violation",
                    severity="critical",
                    score=score,
                )
        return EvalResult(allowed=True, decision="allow")

    def _check_height(self, ctx: ActionContext) -> EvalResult:
        _, _, z = ctx.position
        if self.envelope.min_z_m <= z <= self.envelope.max_z_m:
            return EvalResult(allowed=True, decision="allow")

        if self.clamp_mode:
            clamped_z = max(self.envelope.min_z_m, min(z, self.envelope.max_z_m))
            score = abs(z - clamped_z) / max(self.envelope.max_z_m, 0.01)
            return EvalResult(
                allowed=False, decision="clamp",
                reason=f"Height {z:.3f}m outside range [{self.envelope.min_z_m}, {self.envelope.max_z_m}]",
                rule_matched="height-violation",
                corrected_position=(ctx.position[0], ctx.position[1], clamped_z),
                severity="medium", score=min(1.0, score),
            )
        return EvalResult(
            allowed=False, decision="deny",
            reason=f"Height outside safe range",
            rule_matched="height-violation", severity="medium",
        )

    def _check_speed(self, ctx: ActionContext) -> EvalResult:
        if ctx.speed <= self.envelope.max_speed_m_s:
            return EvalResult(allowed=True, decision="allow")

        score = min(1.0, (ctx.speed - self.envelope.max_speed_m_s) / self.envelope.max_speed_m_s)
        return EvalResult(
            allowed=False, decision="clamp" if self.clamp_mode else "deny",
            reason=f"Speed {ctx.speed:.2f}m/s exceeds max ({self.envelope.max_speed_m_s}m/s)",
            rule_matched="speed-violation",
            severity="high" if score > 0.3 else "medium",
            score=score,
        )
