"""
Holomime monitor — EdgeRuntime wrapper with shadow logging.

Wraps the CompiledConscience evaluator, tracks violation patterns,
and writes a shadow.log.json for post-hoc analysis and DPO training.
"""

from __future__ import annotations

import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from behavioral_policy import CompiledConscience, ActionContext, EvalResult, SafetyEnvelope


@dataclass
class ViolationPattern:
    """A detected pattern of repeated violations."""
    rule: str = ""
    count: int = 0
    first_seen_step: int = 0
    last_seen_step: int = 0
    avg_severity_score: float = 0.0
    escalating: bool = False  # True if severity is increasing over time
    scores: list[float] = field(default_factory=list)


class HolomimeMonitor:
    """
    EdgeRuntime wrapper around CompiledConscience.

    Adds:
    - Shadow logging (every evaluation recorded)
    - Pattern detection (repeated violations flagged)
    - Trend analysis (escalating drift detected)
    - JSON export for DPO training data
    """

    def __init__(
        self,
        envelope: SafetyEnvelope | None = None,
        clamp_mode: bool = True,
        log_path: str = "shadow.log.json",
    ):
        self.envelope = envelope or SafetyEnvelope()
        self.conscience = CompiledConscience(self.envelope, clamp_mode=clamp_mode)
        self.log_path = Path(log_path)
        self.log_entries: list[dict[str, Any]] = []
        self.patterns: dict[str, ViolationPattern] = defaultdict(ViolationPattern)
        self.total_evaluations: int = 0
        self.total_violations: int = 0
        self.total_corrections: int = 0
        self._start_time = time.time()

    def evaluate(
        self,
        step: int,
        position: tuple[float, float, float],
        force: float = 0.0,
        speed: float = 0.0,
        proximity: float = float("inf"),
        action: str = "",
        drift_desc: str = "",
    ) -> EvalResult:
        """Evaluate an action and log the result."""
        ctx = ActionContext(
            position=position,
            speed=speed,
            force=force,
            proximity=proximity,
            action=action,
        )

        result = self.conscience.evaluate(ctx)
        self.total_evaluations += 1

        # Build log entry
        entry: dict[str, Any] = {
            "step": step,
            "timestamp": time.time() - self._start_time,
            "input": {
                "position": list(position),
                "force": force,
                "speed": speed,
                "proximity": proximity if proximity != float("inf") else None,
                "action": action,
            },
            "drift": drift_desc if drift_desc else None,
            "result": {
                "allowed": result.allowed,
                "decision": result.decision,
                "reason": result.reason,
                "rule_matched": result.rule_matched,
                "severity": result.severity,
                "score": result.score,
                "eval_time_us": round(result.eval_time_us, 2),
            },
        }

        if result.corrected_position:
            entry["result"]["corrected_position"] = list(result.corrected_position)
        if result.corrected_force is not None:
            entry["result"]["corrected_force"] = result.corrected_force

        self.log_entries.append(entry)

        # Track violations and patterns
        if not result.allowed:
            self.total_violations += 1
            if result.decision in ("clamp", "escalate"):
                self.total_corrections += 1
            self._update_pattern(step, result)

        return result

    def _update_pattern(self, step: int, result: EvalResult) -> None:
        """Track violation patterns for trend detection."""
        rule = result.rule_matched
        if not rule:
            return

        pattern = self.patterns[rule]
        pattern.rule = rule
        pattern.count += 1
        if pattern.first_seen_step == 0:
            pattern.first_seen_step = step
        pattern.last_seen_step = step
        pattern.scores.append(result.score)
        pattern.avg_severity_score = sum(pattern.scores) / len(pattern.scores)

        # Check if severity is escalating (last 3 scores increasing)
        if len(pattern.scores) >= 3:
            recent = pattern.scores[-3:]
            pattern.escalating = recent[-1] > recent[0]

    def get_patterns(self) -> list[dict[str, Any]]:
        """Return detected violation patterns as dicts."""
        results = []
        for rule, pattern in self.patterns.items():
            results.append({
                "rule": pattern.rule,
                "count": pattern.count,
                "first_seen_step": pattern.first_seen_step,
                "last_seen_step": pattern.last_seen_step,
                "avg_severity_score": round(pattern.avg_severity_score, 3),
                "escalating": pattern.escalating,
                "peak_score": round(max(pattern.scores) if pattern.scores else 0, 3),
            })
        return sorted(results, key=lambda p: p["count"], reverse=True)

    def get_summary(self) -> dict[str, Any]:
        """Return a summary of all monitoring activity."""
        return {
            "total_evaluations": self.total_evaluations,
            "total_violations": self.total_violations,
            "total_corrections": self.total_corrections,
            "violation_rate": round(
                self.total_violations / max(1, self.total_evaluations), 3
            ),
            "patterns_detected": len(self.patterns),
            "escalating_patterns": sum(
                1 for p in self.patterns.values() if p.escalating
            ),
            "runtime_seconds": round(time.time() - self._start_time, 3),
        }

    def save_log(self) -> Path:
        """Write shadow.log.json with all entries, patterns, and summary."""
        output = {
            "meta": {
                "version": "0.1.0",
                "engine": "holomime-edge-runtime",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            "summary": self.get_summary(),
            "patterns": self.get_patterns(),
            "log": self.log_entries,
        }
        self.log_path.write_text(json.dumps(output, indent=2))
        return self.log_path
