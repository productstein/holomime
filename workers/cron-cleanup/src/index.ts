export interface Env {
  CRON_SECRET: string;
  CLEANUP_URL: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      fetch(env.CLEANUP_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
      }).then(async (res) => {
        const body = await res.text();
        if (!res.ok) {
          console.error(`Cleanup failed (${res.status}): ${body}`);
        } else {
          console.log(`Cleanup succeeded: ${body}`);
        }
      }),
    );
  },
};
