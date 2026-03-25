# Contributing to holomime

## Security

- **Never commit .env files** — they're in .gitignore but verify with `git check-ignore .env`
- **API keys must come from environment variables** — never hardcode `sk-ant-*`, `sk-*`, or any token values
- **The .holomime/ directory contains runtime data** — sessions, assessments, credentials, and behavioral corpus are all gitignored
- **Run `git diff --cached` before committing** to verify no secrets are staged

## Development

1. Clone the repo
2. `npm install`
3. `npm run build` — build the package
4. `npm test` — run all tests (660+ tests)
5. `npm run dev` — start development mode

## Identity Stack

The 8-file Identity Stack is the core architecture:

| File | What it does | Who modifies it |
|------|-------------|----------------|
| soul.md | Values, ethics, essence | Human only |
| mind.sys | Personality traits, EQ | Therapy (auto-patched) |
| purpose.cfg | Role, objectives, domain | Per deployment |
| shadow.log | Detected drift patterns | Diagnosis (auto-generated) |
| memory.store | Accumulated experience | System (append-only) |
| body.api | Hardware profile | Per robot body |
| conscience.exe | Safety rules | Human only |
| ego.runtime | Runtime mediation | System (configurable) |

## Code Style

- TypeScript strict mode
- Vitest for testing
- Zod for schema validation
- No Co-Authored-By lines in commits
