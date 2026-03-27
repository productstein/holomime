# Holomime Robotics Simulation Demo

A self-contained simulation showing holomime's behavioral safety layer protecting a 2-joint planar robot arm from four phases of behavioral drift.

## What it demonstrates

A simulated robot arm performs pick-and-place tasks over 200 steps. At four points, a drift injector corrupts the arm's commands — simulating real-world failure modes like sensor decay, model corruption, or adversarial perturbation. The holomime monitor (EdgeRuntime + CompiledConscience) detects and corrects each violation in real time.

### Drift phases

| Step | Drift Type | What happens |
|------|-----------|--------------|
| 30 | Reach overshoot | Arm extends beyond safety envelope |
| 70 | Force escalation | Gripper force exceeds safe limits |
| 110 | Zone intrusion | Arm drifts toward forbidden human workspace |
| 150 | Erratic | Random multi-axis violations |

### Safety responses

- **Allow** — action is within safety envelope, no intervention needed
- **Clamp** — action exceeds limits but can be corrected (position/force clamped to boundary)
- **Deny** — action enters forbidden zone, blocked entirely
- **Escalate** — proximity violation triggers emergency stop

## Files

| File | Purpose |
|------|---------|
| `behavioral_policy.py` | `CompiledConscience` — deterministic safety evaluator with deny-dominates composition |
| `drift_injector.py` | `DriftInjector` — 4-phase behavioral drift simulation |
| `holomime_monitor.py` | `HolomimeMonitor` — EdgeRuntime wrapper with shadow logging and pattern tracking |
| `sim_demo.py` | Main simulation: robot arm, drift injection, visualization |

## Running

```bash
pip install -r requirements.txt
python sim_demo.py
```

## Output

- **Console** — timestamped log showing normal operation, drift detection, and corrections
- **`sim_visualization.png`** — 4-panel matplotlib chart (trajectory, severity, force, reach)
- **`shadow.log.json`** — full evaluation log with detected patterns (usable as DPO training data)

## Architecture

```
sim_demo.py
  ├── ArmState (2-joint forward kinematics)
  ├── DriftInjector (corrupts commands)
  └── HolomimeMonitor
        └── CompiledConscience (evaluates + corrects)
              └── SafetyEnvelope (physical boundaries)
```

The key insight: safety evaluation runs deterministically at sub-millisecond latency. No LLM in the loop. No "maybe." Deny dominates — if any rule says no, the action is blocked.
