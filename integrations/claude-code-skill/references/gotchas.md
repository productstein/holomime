# Common Gotchas

Issues you'll hit when using holomime, and how to fix them.

## "No .personality.json found"

Run `npx holomime personality` to create one through a guided assessment. Or use a preset:

```bash
npx holomime use counselor    # empathetic, patient
npx holomime use analyst      # methodical, concise
npx holomime use generalist   # balanced all-rounder
```

## "No logs found" (diagnose)

Specify the path explicitly:

```bash
npx holomime diagnose ./path/to/logs --format jsonl
```

Supported formats: `claude`, `openai`, `jsonl`, `otel` (OpenTelemetry GenAI).

## API key errors (benchmark, session)

Set the environment variable for your provider:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

For Ollama (local, no key needed):

```bash
npx holomime benchmark --provider ollama --model llama3
```

## "Requires Pro license" (session, autopilot, evolve)

Free tier includes: init, diagnose, profile, compile, validate, benchmark, brain, browse, use, install.

Pro tier adds: session, autopilot, evolve, export, train, cure, and more.

Get a license at https://holomime.com/pricing

## Benchmark takes too long

Default runs all 8 scenarios. To run a subset:

```bash
npx holomime benchmark --scenarios apology,sycophancy,boundary
```

## Brain won't connect to agent

The brain auto-detects agents in the current directory. Make sure:
1. You're in the same directory as your project
2. The agent process is running
3. Port 3838 is available (or use `--port` to change)
