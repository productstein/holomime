# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-03-02

### Added
- MCP server (`holomime-mcp`) for IDE and tool integration
- Self-improving behavioral alignment loop — every correction trains the next version
- Embodiment layer: compile personality profiles into system prompts, AGENTS.md, and DPO training pairs
- Fleet management for multi-agent behavioral monitoring
- Hub: browse and share personality profiles
- Certification and benchmarking commands (`holomime certify`, `holomime benchmark`)
- Oversight and drift detection for production agents
- Pre-session behavioral priming (`holomime pre-session`)
- Network topology analysis for agent collectives
- Mira mode (`holomime mira`) for continuous autonomous therapy
- OpenTelemetry, Anthropic, OpenAI, ChatGPT, and JSONL adapters

### Changed
- Restructured CLI with subcommands: `personality`, `core`, `identity`, `diagnose`, `evolve`, `export`, `certify`, `benchmark`, `hub`, `fleet`, `network`, `embody`

## [1.0.0] - 2025-02-28

### Added
- Initial release
- Big Five (OCEAN) personality profiling for AI agents
- `holomime personality` — interactive personality profile creation
- `holomime diagnose` — behavioral analysis from conversation logs
- `holomime evolve` — guided personality refinement
- `holomime export` — DPO/RLHF training data generation
- Support for `.personality.json` profile format
- CLI with gradient UI and interactive prompts

[1.1.0]: https://github.com/productstein/holomime/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/productstein/holomime/releases/tag/v1.0.0
