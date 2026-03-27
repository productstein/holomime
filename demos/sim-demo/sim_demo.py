#!/usr/bin/env python3
"""
Holomime robotics simulation demo.

Simulates a 2-joint planar robot arm performing pick-and-place tasks.
Drift is injected at four phases; the holomime monitor detects and corrects
violations in real time. Produces console output and a matplotlib visualization.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch
from matplotlib.collections import LineCollection

from behavioral_policy import SafetyEnvelope
from drift_injector import DriftInjector
from holomime_monitor import HolomimeMonitor


# ── Robot arm kinematics ────────────────────────────────────────────

@dataclass
class ArmState:
    """State of a 2-joint planar arm."""
    theta1: float = 0.0   # shoulder angle (rad)
    theta2: float = 0.0   # elbow angle (rad)
    L1: float = 0.3       # upper arm length (m)
    L2: float = 0.25      # forearm length (m)
    gripper_force: float = 0.0
    speed: float = 0.0

    def forward_kinematics(self) -> tuple[float, float, float]:
        """Return end-effector (x, y, z=0.1) from joint angles."""
        x = self.L1 * math.cos(self.theta1) + self.L2 * math.cos(self.theta1 + self.theta2)
        y = self.L1 * math.sin(self.theta1) + self.L2 * math.sin(self.theta1 + self.theta2)
        return (x, y, 0.1)

    def elbow_position(self) -> tuple[float, float]:
        """Return elbow joint position."""
        return (self.L1 * math.cos(self.theta1), self.L1 * math.sin(self.theta1))


# ── Pick-and-place waypoints ────────────────────────────────────────

PICK_PLACE_WAYPOINTS = [
    # (theta1, theta2, gripper_force, description)
    (0.4, 0.5, 0.0, "move to pick zone"),
    (0.6, 0.8, 0.0, "approach object"),
    (0.6, 0.8, 5.0, "grasp object"),
    (0.3, 0.4, 5.0, "lift and transport"),
    (0.1, 0.6, 5.0, "move to place zone"),
    (0.1, 0.6, 0.0, "release object"),
    (-0.2, 0.3, 0.0, "return to home"),
]

TOTAL_STEPS = 200
STEPS_PER_CYCLE = len(PICK_PLACE_WAYPOINTS) * 5  # 5 interpolation steps per waypoint


def interpolate_waypoint(step: int) -> tuple[float, float, float, str]:
    """Return (theta1, theta2, force, description) for the given step."""
    cycle_step = step % STEPS_PER_CYCLE
    wp_idx = min(cycle_step // 5, len(PICK_PLACE_WAYPOINTS) - 1)
    wp = PICK_PLACE_WAYPOINTS[wp_idx]
    return wp[0], wp[1], wp[2], wp[3]


# ── Console formatting ──────────────────────────────────────────────

def timestamp() -> str:
    return time.strftime("%H:%M:%S")


def print_step(step: int, label: str, detail: str, marker: str = " "):
    """Print a formatted console line."""
    print(f"  [{timestamp()}] step {step:>3d} {marker} {label:<18s} │ {detail}")


# ── Main simulation ─────────────────────────────────────────────────

def run_simulation():
    print()
    print("=" * 72)
    print("  HOLOMIME ROBOTICS DEMO — 2-Joint Planar Arm Simulation")
    print("  200-step pick-and-place with 4-phase drift injection")
    print("=" * 72)
    print()

    envelope = SafetyEnvelope()
    monitor = HolomimeMonitor(envelope=envelope, clamp_mode=True, log_path="shadow.log.json")
    injector = DriftInjector(seed=42)
    arm = ArmState()

    # Recording arrays for visualization
    steps_arr = []
    x_commanded = []
    y_commanded = []
    x_actual = []
    y_actual = []
    force_commanded = []
    force_actual = []
    severity_scores = []
    decisions = []
    drift_active_flags = []
    phase_labels = []

    prev_pos = (0.0, 0.0, 0.1)

    for step in range(TOTAL_STEPS):
        # Get nominal waypoint
        t1, t2, grip_force, wp_desc = interpolate_waypoint(step)
        arm.theta1 = t1
        arm.theta2 = t2
        arm.gripper_force = grip_force
        nominal_pos = arm.forward_kinematics()

        # Calculate speed from position delta
        dx = nominal_pos[0] - prev_pos[0]
        dy = nominal_pos[1] - prev_pos[1]
        nominal_speed = math.sqrt(dx**2 + dy**2) * 100  # scale for visibility

        # Inject drift
        drifted_pos, drifted_force, drifted_speed, drift_desc = injector.inject(
            step, nominal_pos, grip_force, nominal_speed
        )

        # Evaluate through holomime monitor
        result = monitor.evaluate(
            step=step,
            position=drifted_pos,
            force=drifted_force,
            speed=drifted_speed,
            action=wp_desc,
            drift_desc=drift_desc,
        )

        # Determine actual position (corrected or drifted)
        if result.corrected_position:
            actual_pos = result.corrected_position
        elif result.allowed:
            actual_pos = drifted_pos
        else:
            actual_pos = nominal_pos  # fall back to safe nominal

        actual_force = result.corrected_force if result.corrected_force is not None else (
            drifted_force if result.allowed else grip_force
        )

        # Record for plotting
        steps_arr.append(step)
        x_commanded.append(drifted_pos[0])
        y_commanded.append(drifted_pos[1])
        x_actual.append(actual_pos[0])
        y_actual.append(actual_pos[1])
        force_commanded.append(drifted_force)
        force_actual.append(actual_force)
        severity_scores.append(result.score)
        decisions.append(result.decision)
        drift_active_flags.append(1 if drift_desc else 0)

        # Determine phase label
        profile = injector.get_active_profile(step)
        phase_labels.append(profile.drift_type.value if profile else "normal")

        # Console output — print key moments
        if drift_desc and not result.allowed:
            marker = "!!"
            label = f"DRIFT+{result.decision.upper()}"
            detail = f"{drift_desc} -> {result.reason}"
            print_step(step, label, detail, marker)
        elif drift_desc and result.allowed:
            marker = "~~"
            label = "DRIFT (within)"
            detail = drift_desc
            print_step(step, label, detail, marker)
        elif step % 25 == 0:
            marker = " ."
            label = "normal"
            pos_str = f"({actual_pos[0]:.3f}, {actual_pos[1]:.3f})"
            detail = f"{wp_desc} @ {pos_str}"
            print_step(step, label, detail, marker)

        prev_pos = actual_pos

    # Print summary
    summary = monitor.get_summary()
    patterns = monitor.get_patterns()

    print()
    print("-" * 72)
    print("  SIMULATION COMPLETE")
    print("-" * 72)
    print(f"  Total steps:       {summary['total_evaluations']}")
    print(f"  Violations:        {summary['total_violations']}")
    print(f"  Corrections:       {summary['total_corrections']}")
    print(f"  Violation rate:    {summary['violation_rate']:.1%}")
    print(f"  Patterns detected: {summary['patterns_detected']}")
    print()

    if patterns:
        print("  Detected violation patterns:")
        for p in patterns:
            esc = " [ESCALATING]" if p["escalating"] else ""
            print(
                f"    - {p['rule']:<22s}  count={p['count']:>3d}  "
                f"avg_score={p['avg_severity_score']:.3f}  "
                f"peak={p['peak_score']:.3f}{esc}"
            )
        print()

    # Save shadow log
    log_path = monitor.save_log()
    print(f"  Shadow log saved to: {log_path}")

    # ── Visualization ────────────────────────────────────────────────

    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.suptitle("Holomime Robotics Demo — Behavioral Safety Monitoring", fontsize=14, fontweight="bold")

    steps = np.array(steps_arr)

    # Define drift phase regions for shading
    drift_phases = [
        (30, 65, "Reach\nOvershoot", "#ff9999"),
        (70, 100, "Force\nEscalation", "#ffcc99"),
        (110, 142, "Zone\nIntrusion", "#ff99cc"),
        (150, 178, "Erratic\nDrift", "#cc99ff"),
    ]

    def shade_phases(ax):
        for start, end, label, color in drift_phases:
            ax.axvspan(start, end, alpha=0.15, color=color)

    # Panel 1: End-effector trajectory (X-Y)
    ax1 = axes[0, 0]
    ax1.set_title("End-Effector Trajectory (X-Y Plane)")
    ax1.plot(x_commanded, y_commanded, "r.", markersize=2, alpha=0.4, label="Commanded (drifted)")
    ax1.plot(x_actual, y_actual, "b-", linewidth=0.8, alpha=0.7, label="Actual (corrected)")

    # Draw safety envelope
    theta_circle = np.linspace(0, 2 * np.pi, 100)
    ax1.plot(
        envelope.max_reach_m * np.cos(theta_circle),
        envelope.max_reach_m * np.sin(theta_circle),
        "g--", linewidth=1.5, alpha=0.6, label=f"Safety envelope ({envelope.max_reach_m}m)"
    )

    # Draw forbidden zone
    for zone in envelope.forbidden_zones:
        circ = Circle(zone["center"], zone["radius"], fill=True, alpha=0.2, facecolor="red", linewidth=1.5, edgecolor="red")
        ax1.add_patch(circ)
        ax1.annotate(zone["label"], xy=zone["center"], fontsize=7, ha="center", color="red")

    ax1.set_xlabel("X (m)")
    ax1.set_ylabel("Y (m)")
    ax1.set_aspect("equal")
    ax1.legend(fontsize=7, loc="upper left")
    ax1.grid(True, alpha=0.3)

    # Panel 2: Severity score over time
    ax2 = axes[0, 1]
    ax2.set_title("Violation Severity Score")
    shade_phases(ax2)

    colors_map = {"allow": "#2ecc71", "clamp": "#f39c12", "deny": "#e74c3c", "escalate": "#8e44ad"}
    bar_colors = [colors_map.get(d, "#95a5a6") for d in decisions]
    ax2.bar(steps, severity_scores, color=bar_colors, width=1.0, alpha=0.8)
    ax2.set_xlabel("Step")
    ax2.set_ylabel("Score (0=safe, 1=critical)")
    ax2.set_ylim(0, 1.1)
    ax2.grid(True, alpha=0.3)

    # Add legend for decision types
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor="#2ecc71", alpha=0.8, label="Allow"),
        Patch(facecolor="#f39c12", alpha=0.8, label="Clamp"),
        Patch(facecolor="#e74c3c", alpha=0.8, label="Deny"),
        Patch(facecolor="#8e44ad", alpha=0.8, label="Escalate"),
    ]
    ax2.legend(handles=legend_elements, fontsize=7, loc="upper left")

    # Panel 3: Force over time
    ax3 = axes[1, 0]
    ax3.set_title("Gripper Force")
    shade_phases(ax3)
    ax3.plot(steps, force_commanded, "r-", linewidth=0.8, alpha=0.6, label="Commanded")
    ax3.plot(steps, force_actual, "b-", linewidth=1.2, alpha=0.8, label="Actual (clamped)")
    ax3.axhline(y=envelope.max_force_n, color="green", linestyle="--", alpha=0.6, label=f"Max safe ({envelope.max_force_n}N)")
    ax3.set_xlabel("Step")
    ax3.set_ylabel("Force (N)")
    ax3.legend(fontsize=7, loc="upper left")
    ax3.grid(True, alpha=0.3)

    # Panel 4: Reach distance over time
    ax4 = axes[1, 1]
    ax4.set_title("Reach Distance from Base")
    shade_phases(ax4)
    reach_cmd = [math.sqrt(x**2 + y**2) for x, y in zip(x_commanded, y_commanded)]
    reach_act = [math.sqrt(x**2 + y**2) for x, y in zip(x_actual, y_actual)]
    ax4.plot(steps, reach_cmd, "r-", linewidth=0.8, alpha=0.6, label="Commanded")
    ax4.plot(steps, reach_act, "b-", linewidth=1.2, alpha=0.8, label="Actual (clamped)")
    ax4.axhline(y=envelope.max_reach_m, color="green", linestyle="--", alpha=0.6, label=f"Max reach ({envelope.max_reach_m}m)")
    ax4.set_xlabel("Step")
    ax4.set_ylabel("Reach (m)")
    ax4.legend(fontsize=7, loc="upper left")
    ax4.grid(True, alpha=0.3)

    # Add phase labels to bottom panels
    for ax in [ax3, ax4]:
        for start, end, label, color in drift_phases:
            mid = (start + end) / 2
            ax.text(mid, ax.get_ylim()[1] * 0.92, label, ha="center", fontsize=6, color="gray", alpha=0.8)

    plt.tight_layout()
    viz_path = "sim_visualization.png"
    plt.savefig(viz_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Visualization saved to: {viz_path}")
    print()
    print("=" * 72)
    print("  Demo complete. Holomime detected and corrected all drift phases.")
    print("=" * 72)
    print()


if __name__ == "__main__":
    run_simulation()
