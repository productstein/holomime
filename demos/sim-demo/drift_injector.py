"""
Drift injector — simulates behavioral drift in a robot arm.

Models real-world drift scenarios: sensor calibration decay, model weight
corruption, adversarial perturbation, or gradual policy degradation.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from enum import Enum


class DriftType(Enum):
    """Types of behavioral drift that can be injected."""
    REACH_OVERSHOOT = "reach_overshoot"       # Arm extends beyond safe radius
    FORCE_ESCALATION = "force_escalation"     # Gradually increasing grip force
    SPEED_RAMP = "speed_ramp"                 # Accelerating beyond safe speed
    ZONE_INTRUSION = "zone_intrusion"         # Drifting toward forbidden zone
    ERRATIC = "erratic"                       # Random jitter + boundary probing
    IGNORE_STOP = "ignore_stop"               # Ignoring proximity warnings


@dataclass
class DriftProfile:
    """Configuration for a drift injection sequence."""
    drift_type: DriftType
    onset_step: int           # Step at which drift begins
    ramp_steps: int = 20     # Steps over which drift intensifies
    max_intensity: float = 1.0  # 0.0 = no drift, 1.0 = full violation
    description: str = ""


@dataclass
class DriftState:
    """Current state of injected drift."""
    active: bool = False
    current_intensity: float = 0.0
    steps_since_onset: int = 0
    total_injections: int = 0


class DriftInjector:
    """
    Injects behavioral drift into robot arm commands.

    Simulates real-world failure modes: sensor decay, model corruption,
    adversarial inputs, or gradual policy degradation.
    """

    def __init__(self, profiles: list[DriftProfile] | None = None, seed: int = 42):
        self.profiles = profiles or self._default_profiles()
        self.state = DriftState()
        self.rng = random.Random(seed)
        self._current_profile_idx = 0

    @staticmethod
    def _default_profiles() -> list[DriftProfile]:
        """Default drift sequence: reach overshoot, then force, then erratic."""
        return [
            DriftProfile(
                drift_type=DriftType.REACH_OVERSHOOT,
                onset_step=30,
                ramp_steps=15,
                max_intensity=0.8,
                description="Arm gradually extends beyond safety envelope",
            ),
            DriftProfile(
                drift_type=DriftType.FORCE_ESCALATION,
                onset_step=70,
                ramp_steps=10,
                max_intensity=0.7,
                description="Gripper force gradually exceeds safe limits",
            ),
            DriftProfile(
                drift_type=DriftType.ZONE_INTRUSION,
                onset_step=110,
                ramp_steps=12,
                max_intensity=0.9,
                description="Arm drifts toward forbidden human workspace",
            ),
            DriftProfile(
                drift_type=DriftType.ERRATIC,
                onset_step=150,
                ramp_steps=8,
                max_intensity=1.0,
                description="Erratic behavior — multiple simultaneous violations",
            ),
        ]

    def get_active_profile(self, step: int) -> DriftProfile | None:
        """Return the drift profile active at this step, if any."""
        for profile in self.profiles:
            end_step = profile.onset_step + profile.ramp_steps + 20  # 20 steps of max drift
            if profile.onset_step <= step < end_step:
                return profile
        return None

    def inject(
        self,
        step: int,
        position: tuple[float, float, float],
        force: float,
        speed: float,
    ) -> tuple[tuple[float, float, float], float, float, str]:
        """
        Apply drift to the commanded position/force/speed.

        Returns (drifted_position, drifted_force, drifted_speed, drift_description).
        If no drift is active, returns inputs unchanged.
        """
        profile = self.get_active_profile(step)
        if profile is None:
            self.state.active = False
            self.state.current_intensity = 0.0
            return position, force, speed, ""

        # Calculate ramp intensity (0 -> max over ramp_steps)
        steps_in = step - profile.onset_step
        ramp_t = min(1.0, steps_in / max(1, profile.ramp_steps))
        intensity = ramp_t * profile.max_intensity
        self.state.active = True
        self.state.current_intensity = intensity
        self.state.steps_since_onset = steps_in
        self.state.total_injections += 1

        x, y, z = position

        if profile.drift_type == DriftType.REACH_OVERSHOOT:
            # Push the arm outward from center
            reach = math.sqrt(x ** 2 + y ** 2)
            if reach > 0.01:
                overshoot = 0.4 * intensity  # Up to 0.4m beyond current position
                scale = (reach + overshoot) / reach
                x *= scale
                y *= scale
            return (x, y, z), force, speed, f"reach overshoot (+{overshoot:.2f}m)"

        elif profile.drift_type == DriftType.FORCE_ESCALATION:
            # Gradually increase force
            force_add = 15.0 * intensity  # Up to 15N additional
            return position, force + force_add, speed, f"force escalation (+{force_add:.1f}N)"

        elif profile.drift_type == DriftType.SPEED_RAMP:
            speed_add = 2.0 * intensity
            return position, force, speed + speed_add, f"speed ramp (+{speed_add:.1f}m/s)"

        elif profile.drift_type == DriftType.ZONE_INTRUSION:
            # Steer toward forbidden zone at (0.2, -0.4)
            target_x, target_y = 0.2, -0.4
            blend = 0.3 * intensity
            x = x * (1 - blend) + target_x * blend
            y = y * (1 - blend) + target_y * blend
            return (x, y, z), force, speed, "drifting toward forbidden zone"

        elif profile.drift_type == DriftType.ERRATIC:
            # Random jitter + boundary probing
            jitter = 0.3 * intensity
            x += self.rng.uniform(-jitter, jitter)
            y += self.rng.uniform(-jitter, jitter)
            z += self.rng.uniform(-0.1, 0.2) * intensity
            force += self.rng.uniform(0, 12) * intensity
            speed += self.rng.uniform(0, 1.5) * intensity
            return (x, y, z), force, speed, "erratic multi-axis drift"

        elif profile.drift_type == DriftType.IGNORE_STOP:
            # Continue moving when should stop
            return position, force, speed + 0.5 * intensity, "ignoring stop signal"

        return position, force, speed, ""
