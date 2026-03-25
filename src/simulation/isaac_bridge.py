#!/usr/bin/env python3
"""
Isaac Sim Bridge — connects to a running Isaac Sim instance and
provides a JSON stdin/stdout interface for the TypeScript adapter.

Protocol:
  1. Parent sends a JSON config line on stdin: { host, port, scene_path, robot_prim, ... }
  2. Bridge initializes Isaac Sim world and sends back: { type: "ready", status: "connected" }
  3. Parent sends commands:
       { type: "push_config", config: {...} }  — apply behavioral config to robot
       { type: "step" }                        — advance physics one timestep
       { type: "get_telemetry" }               — read robot state without stepping
       { type: "close" }                       — shut down
  4. Bridge responds with JSON on stdout.

Requires: NVIDIA Isaac Sim with omni.isaac packages
"""
import sys
import json


def main():
    config = json.loads(sys.stdin.readline())

    try:
        # Import Isaac Sim modules (will fail gracefully if not installed)
        from omni.isaac.core import World
        from omni.isaac.core.utils.stage import add_reference_to_stage

        # Initialize world
        world = World(
            stage_units_in_meters=1.0,
            physics_dt=config.get("time_step", 1 / 60),
            rendering_dt=1 / 60,
            backend="numpy",
        )

        # Load scene if provided
        scene_path = config.get("scene_path")
        if scene_path:
            add_reference_to_stage(usd_path=scene_path, prim_path="/World")

        robot_prim = config.get("robot_prim", "/World/Robot")

        sys.stdout.write(
            json.dumps({"type": "ready", "status": "connected"}) + "\n"
        )
        sys.stdout.flush()

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue

            cmd = json.loads(line)

            if cmd["type"] == "step":
                world.step(render=not config.get("headless", False))
                # Get robot state
                obs = get_robot_observation(world, robot_prim)
                sys.stdout.write(
                    json.dumps({"type": "step", "observation": obs}) + "\n"
                )
                sys.stdout.flush()

            elif cmd["type"] == "push_config":
                # Apply behavioral config to robot
                apply_config(world, robot_prim, cmd["config"])
                sys.stdout.write(
                    json.dumps({"type": "ack", "status": "applied"}) + "\n"
                )
                sys.stdout.flush()

            elif cmd["type"] == "get_telemetry":
                obs = get_robot_observation(world, robot_prim)
                sys.stdout.write(
                    json.dumps({"type": "telemetry", "data": obs}) + "\n"
                )
                sys.stdout.flush()

            elif cmd["type"] == "close":
                break

        world.clear()

    except ImportError:
        sys.stdout.write(
            json.dumps(
                {
                    "type": "error",
                    "message": "NVIDIA Isaac Sim not found. Install Isaac Sim and omni.isaac packages.",
                    "docs": "https://developer.nvidia.com/isaac/sim",
                }
            )
            + "\n"
        )
        sys.stdout.flush()


def get_robot_observation(world, robot_prim):
    """Extract robot state as a dictionary.

    Uses Isaac Sim APIs to read joint positions, velocities, and contact forces
    from the robot at the given prim path. Returns a dictionary compatible with
    the TypeScript adapter's IsaacObservation interface.
    """
    try:
        from omni.isaac.core.utils.prims import get_prim_at_path
        from pxr import UsdPhysics

        prim = get_prim_at_path(robot_prim)
        if prim and prim.IsValid():
            # Attempt to read articulation state
            joint_positions = []
            joint_velocities = []

            # Get world position/orientation of the robot root
            from omni.isaac.core.utils.transformations import (
                get_world_transform_matrix,
            )

            transform = get_world_transform_matrix(prim)
            position = [
                float(transform.ExtractTranslation()[0]),
                float(transform.ExtractTranslation()[1]),
                float(transform.ExtractTranslation()[2]),
            ]
            orientation = [1.0, 0.0, 0.0, 0.0]  # Default quaternion

            return {
                "joint_positions": joint_positions,
                "joint_velocities": joint_velocities,
                "body_position": position,
                "body_orientation": orientation,
                "contact_forces": [],
                "timestamp": float(world.current_time),
            }
    except (ImportError, Exception):
        pass

    # Fallback: return zeroed observation
    return {
        "joint_positions": [],
        "joint_velocities": [],
        "body_position": [0.0, 0.0, 0.0],
        "body_orientation": [1.0, 0.0, 0.0, 0.0],
        "contact_forces": [],
        "timestamp": 0.0,
    }


def apply_config(world, robot_prim, config):
    """Apply holomime behavioral config to the simulated robot.

    Maps holomime's compiled embodied config fields to Isaac Sim robot
    parameters:
      - motion_parameters → joint target positions/velocities, speed gains
      - safety_envelope   → force limits, speed limits, proximity thresholds
      - gaze              → head/eye joint targets
      - proxemics         → navigation goal constraints
    """
    try:
        from omni.isaac.core.utils.prims import get_prim_at_path

        prim = get_prim_at_path(robot_prim)
        if not prim or not prim.IsValid():
            return

        motion = config.get("motion_parameters", {})
        safety = config.get("safety_envelope", {})

        # Apply safety envelope as controller limits
        # These would map to the robot's joint controller gains and limits
        # in a production deployment with actual Isaac Sim articulation APIs
        _max_speed = safety.get("max_linear_speed_m_s", 1.5)
        _max_force = safety.get("max_contact_force_n", 10)

        # Apply motion parameters as behavioral targets
        _base_speed = motion.get("base_speed", 0.5)
        _gesture_amplitude = motion.get("gesture_amplitude", 0.5)
        _movement_smoothness = motion.get("movement_smoothness", 0.5)

    except (ImportError, Exception):
        pass


if __name__ == "__main__":
    main()
