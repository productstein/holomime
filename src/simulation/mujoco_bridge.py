#!/usr/bin/env python3
"""
MuJoCo Bridge — runs a Gymnasium humanoid environment
and communicates with the TypeScript parent via JSON over stdin/stdout.

Protocol:
  1. Parent sends a JSON config line on stdin: { env, render_mode }
  2. Bridge creates the Gymnasium env and sends back: { type: "ready", observation }
  3. Parent sends commands: { type: "step", action }, { type: "reset" }, { type: "close" }
  4. Bridge responds with the corresponding observation/reward/terminated/truncated.

Requires: pip install mujoco gymnasium
"""
import sys
import json
import gymnasium as gym


def main():
    config = json.loads(sys.stdin.readline())
    env_name = config.get("env", "Humanoid-v5")
    render_mode = config.get("render_mode", None)

    env = gym.make(env_name, render_mode=render_mode)
    obs, info = env.reset()

    # Send initial observation
    sys.stdout.write(
        json.dumps({"type": "ready", "observation": obs.tolist()}) + "\n"
    )
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        cmd = json.loads(line)

        if cmd["type"] == "step":
            obs, reward, terminated, truncated, info = env.step(cmd["action"])
            response = {
                "type": "step",
                "observation": obs.tolist(),
                "reward": float(reward),
                "terminated": bool(terminated),
                "truncated": bool(truncated),
            }
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()

        elif cmd["type"] == "reset":
            obs, info = env.reset()
            sys.stdout.write(
                json.dumps({"type": "reset", "observation": obs.tolist()}) + "\n"
            )
            sys.stdout.flush()

        elif cmd["type"] == "observe":
            # Return current observation without stepping
            sys.stdout.write(
                json.dumps({"type": "observe", "observation": obs.tolist()}) + "\n"
            )
            sys.stdout.flush()

        elif cmd["type"] == "close":
            break

    env.close()


if __name__ == "__main__":
    main()
