import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@holomime/api";

export const trpc = createTRPCReact<AppRouter>();
