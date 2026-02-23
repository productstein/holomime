import { router } from "./trpc";
import { agentRouter } from "./routers/agent";
import { vectorRouter } from "./routers/vector";
import { compilerRouter } from "./routers/compiler";
import { telemetryRouter } from "./routers/telemetry";
import { evalRouter } from "./routers/eval";
import { avatarRouter } from "./routers/avatar";
import { userRouter } from "./routers/user";
import { discoverRouter } from "./routers/discover";
import { policyRouter } from "./routers/policy";

export const appRouter = router({
  agent: agentRouter,
  vector: vectorRouter,
  compiler: compilerRouter,
  telemetry: telemetryRouter,
  eval: evalRouter,
  avatar: avatarRouter,
  user: userRouter,
  discover: discoverRouter,
  policy: policyRouter,
});

export type AppRouter = typeof appRouter;

export { type TRPCContext } from "./trpc";
