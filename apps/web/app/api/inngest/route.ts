import { serve } from "inngest/next";
import { inngest, evalRunFunction, telemetryProcessFunction, driftCheckFunction, cacheWarmFunction } from "@holomime/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    evalRunFunction,
    telemetryProcessFunction,
    driftCheckFunction,
    cacheWarmFunction,
  ],
});
