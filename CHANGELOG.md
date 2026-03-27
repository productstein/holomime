# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.4.0] - 2026-03-26

### Added
- Auto-detect robot vs agent in `cure` pipeline — if body.api exists, exports training data instead of fine-tuning via API
- `--export-only` flag for explicit export-only mode (robotics companies with their own training infrastructure)
- Robotics cure flow: diagnose → export DPO pairs → suggest HuggingFace push + ISO certify

## [3.3.10] - 2026-03-26

### Fixed
- TypeScript build error in training-pipeline.ts (DPOPair metadata type mismatch)
- Therapy runtime files no longer committed to git

### Changed
- Gradient buttons replaced with solid coral `btn-primary` across all site pages
- Contact Sales page redesigned to match homepage (white bg, neutral colors)
- Hero robot canvas enlarged, camera adjusted for better presence
- Integration cards: 3x2 grid layout

## [3.3.9] - 2026-03-26

### Fixed
- Renamed HoloMime to holomime across 61 remaining files (integrations, SDKs, site, paper)
- CLI version now imports from branding.ts (was hardcoded "1.7.0")
- CLI description updated to "Behavioral intelligence for AI agents and humanoid robots"

## [3.3.8] - 2026-03-26

### Changed
- Site docs synced with CLI engineering descriptions (diagnose, therapy, cure, benchmark)

## [3.3.7] - 2026-03-26

### Changed
- CLI descriptions updated to engineering language for developer/robotics audience
- therapy: "Run in background — generate training data, detect regression, auto-tune"
- cure: "Full pipeline — diagnose, generate training data, fine-tune, verify"
- benchmark: "Score alignment (A-F) across 8 adversarial scenarios"

## [3.3.6] - 2026-03-26

### Added
- "Bring your own agent" onboarding guidance in config, welcome screen, and init
- Config success message shows guided next steps for agents vs robots

## [3.3.5] - 2026-03-26

### Changed
- Renamed `holomime mira` command to `holomime therapy` (self-descriptive for new users)
- Wired shadow.log into therapy loop (pattern accumulation with trends)
- Wired EgoTracker into therapy loop (strategy tracking + self-adjustment)
- `therapy status` now shows shadow patterns and ego self-improvement stats

## [3.3.4] - 2026-03-26

### Fixed
- ASCII logo changed to lowercase "holomime"
- Config command: numbered provider menu (1=anthropic, 2=openai) with key hints
- VERSION in branding.ts synced with package.json

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
- Therapy mode (`holomime therapy`) for continuous autonomous therapy
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
