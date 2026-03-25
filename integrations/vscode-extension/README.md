# HoloMime Brain — AI Agent Behavioral Monitor

Real-time 3D brain visualization for your AI coding agent. See behavioral patterns light up as your agent works — detect sycophancy, hedging, over-apologizing, and personality drift before they become problems.

## Features

### Show Brain (`HoloMime: Show Brain`)
Opens a 3D brain visualization in a sidebar panel. Brain regions light up in real-time as your AI agent generates responses, showing which behavioral patterns are active.

Works with: **Claude Code, Cline, Cursor, OpenClaw, Codex**

### Diagnose (`HoloMime: Diagnose Active File`)
Run 8 behavioral detectors against any conversation log file. Results appear in the Output panel with pattern severity, examples, and prescriptions.

### Share Snapshot (`HoloMime: Share Brain Snapshot`)
Generate a shareable URL of your agent's brain state. Link is automatically copied to clipboard — share with your team or on social media.

## Requirements

- [holomime](https://www.npmjs.com/package/holomime) installed globally or available via `npx`
- An AI coding agent running (for live brain mode)

## Quick Start

1. Install this extension
2. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run `HoloMime: Show Brain`
4. Start coding with your AI agent — watch the brain light up

## Install HoloMime

```bash
npm install -g holomime
```

Or use directly with `npx` — the extension handles this automatically.

## Links

- [holomime.com](https://holomime.com) — Documentation
- [npm](https://www.npmjs.com/package/holomime) — Package
- [GitHub](https://github.com/productstein/holomime) — Source
