import { createDb } from "@tgbox/db";
import {
  consumeSummaryDlq,
  consumeSummaryMessage,
  SummaryMessage,
  tickSummaryTasks,
} from "./tasks.ts";

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller, env) {
    await tickSummaryTasks(createDb(env.DB), env.MEDIA, env.SUMMARY_QUEUE, Date.now);
  },
  async queue(batch, env) {
    const db = createDb(env.DB);
    for (const message of batch.messages) {
      const parsed = SummaryMessage.safeParse(message.body);
      if (!parsed.success) {
        console.error("ai_summary_invalid_message", { messageId: message.id });
        message.ack();
        continue;
      }
      try {
        if (batch.queue === "tgbox-ai-summary-dlq") {
          await consumeSummaryDlq(db, parsed.data, Date.now());
        } else {
          // Real model adapters are introduced in step 4. This node never calls Workers AI.
          await consumeSummaryMessage(db, env.MEDIA, parsed.data, Date.now);
        }
        message.ack();
      } catch {
        console.error("ai_summary_delivery_error", { jobId: parsed.data.jobId });
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
