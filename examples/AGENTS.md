# AGENTS.md

## Code Conventions

- Use TypeScript strict mode
- Prefer functional patterns over classes
- Use `const` over `let` where possible
- Tabs for indentation, 2 spaces equivalent
- Single quotes for strings
- Run `npm test` before committing

## Testing

- Use Vitest for unit tests
- Tests live in `src/__tests__/`
- Run: `npm test`

## Build

- `npm run build` compiles TypeScript via tsup
- Output goes to `dist/`

## Behavioral Personality

This project uses [holomime](https://holomime.com) for agent behavioral alignment.

- **Spec**: `.personality.json` defines the agent's behavioral profile (Big Five psychology, communication style, boundaries)
- **Readable version**: `.personality.md` is a human-readable summary (regenerate with `holomime profile --format md`)
- **Diagnose**: `holomime diagnose --log <path>` detects behavioral drift (sycophancy, over-apologizing, hedge stacking)
- **Align**: `holomime evolve --personality .personality.json --log <path>` runs structured self-correction

The `.personality.json` governs *how the agent behaves*. The rest of this file governs *how the agent codes*.
