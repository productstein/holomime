import { inngest } from "../client";
import { db } from "@holomime/db";
import { getEvalRun, updateEvalRun, getSuite, getVector } from "@holomime/core";

/**
 * Background job: Execute an evaluation suite against a personality vector.
 *
 * Triggered when a user starts an eval run. Runs each scenario,
 * scores responses, and updates the run with results.
 */
export const evalRunFunction = inngest.createFunction(
  { id: "eval/run", name: "Run Evaluation Suite" },
  { event: "eval/run.requested" },
  async ({ event, step }) => {
    const { runId } = event.data as { runId: string };

    // Mark as running
    await step.run("mark-running", async () => {
      await updateEvalRun(db, runId, { status: "running" });
    });

    // Get run details
    const run = await step.run("get-run", async () => {
      return getEvalRun(db, runId);
    });

    if (!run) throw new Error(`Eval run ${runId} not found`);

    // Get suite and vector
    const [suite, vector] = await Promise.all([
      step.run("get-suite", () => getSuite(db, run.suiteId)),
      step.run("get-vector", () => getVector(db, run.vectorId)),
    ]);

    if (!suite || !vector) throw new Error("Suite or vector not found");

    // Process scenarios (in production, each would call an LLM)
    const results = await step.run("process-scenarios", async () => {
      const scenarios = suite.scenarios as Array<{
        id: string;
        prompt: string;
        expectedBehavior: string;
        rubric: { criteria: Array<{ name: string; weight: number }> };
      }>;

      // Placeholder: in production, compile the vector and run each scenario through an LLM
      return scenarios.map((scenario) => ({
        scenarioId: scenario.id,
        score: 75 + Math.random() * 25, // Placeholder score
        response: "[Eval response would be generated here]",
        criteriaScores: Object.fromEntries(
          scenario.rubric.criteria.map((c) => [c.name, 70 + Math.random() * 30])
        ),
        feedback: "Evaluation pending LLM integration",
      }));
    });

    // Compute overall score
    const overallScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Update run with results
    await step.run("save-results", async () => {
      await updateEvalRun(db, runId, {
        status: "completed",
        results,
        overallScore: Math.round(overallScore),
        completedAt: new Date(),
      });
    });

    return { runId, overallScore: Math.round(overallScore) };
  }
);
