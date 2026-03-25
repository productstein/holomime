---
name: brain
description: Launch a 3D real-time visualization of an AI agent's behavioral patterns. Opens a browser at localhost:3838 showing the NeuralSpace brain with 9 regions lighting up as behavioral patterns fire. Use when you want to visually monitor agent behavior or capture a shareable snapshot.
allowed-tools: Bash
argument-hint: "[--port 3838] [--share]"
---

# Brain Visualization

Launch the NeuralSpace 3D brain visualization to watch behavioral patterns fire in real-time.

## Usage

```bash
npx holomime brain $ARGUMENTS
```

Opens `http://localhost:3838` in your browser.

## Features

- **9 brain regions** mapped to behavioral dimensions
- **Real-time pattern detection** — watch detectors fire as the agent works
- **Auto-detects IDE agents** — Claude Code, Cline, Cursor, OpenClaw
- **Shareable snapshots** — `--share` generates a public URL

## Options

- `--port 3838` — custom port (default 3838)
- `--share` — generate a shareable snapshot URL at `app.holomime.com/brain/<id>`

## Gotchas

- Runs as a local web server — keep the terminal open while viewing
- Works best in Chrome/Edge for WebGL performance
- The brain auto-connects to running agent processes in the same directory
