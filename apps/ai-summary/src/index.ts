import { createDb } from "@tgbox/db";
import { SUMMARY_PARAMS_VERSION, SUMMARY_PROMPT_VERSION } from "@tgbox/shared";
import { createSummaryModel } from "./models.ts";
import { sweepSummaryPublication } from "./publish.ts";
import { summaryGenerationScope } from "./scope.ts";
import {
  consumeSummaryDlq,
  consumeSummaryMessage,
  consumeSummaryObservation,
  SummaryMessage,
  SummaryObserveMessage,
  tickSummaryTasks,
} from "./tasks.ts";

export default {
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller, env) {
    await tickSummaryTasks(
      createDb(env.DB),
      env.MEDIA,
      env.SUMMARY_QUEUE,
      Date.now,
      summaryGenerationScope(env.AI_SUMMARY_SCOPE, env.AI_SUMMARY_ENTRY_IDS),
    );
    if (env.AI_SUMMARY_AUTO_PUBLISH === "1") {
      await sweepSummaryPublication(
        createDb(env.DB),
        env.MEDIA,
        Date.now,
        summaryGenerationScope(env.AI_SUMMARY_SCOPE, env.AI_SUMMARY_ENTRY_IDS),
      );
    }
  },
  async queue(batch, env) {
    const db = createDb(env.DB);
    for (const message of batch.messages) {
      const observation = SummaryObserveMessage.safeParse(message.body);
      if (observation.success) {
        if (batch.queue === "tgbox-ai-summary-dlq") {
          console.error("ai_summary_observation_dlq", { entryId: observation.data.entryId });
          message.ack();
          continue;
        }
        try {
          await consumeSummaryObservation(
            db,
            env.MEDIA,
            env.SUMMARY_QUEUE,
            observation.data,
            Date.now,
            summaryGenerationScope(env.AI_SUMMARY_SCOPE, env.AI_SUMMARY_ENTRY_IDS),
          );
          message.ack();
        } catch {
          console.error("ai_summary_observation_error", { entryId: observation.data.entryId });
          message.retry({ delaySeconds: 60 });
        }
        continue;
      }
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
          await consumeSummaryMessage(
            db,
            env.MEDIA,
            parsed.data,
            Date.now,
            createSummaryModel(env.AI, {
              promptVersion: SUMMARY_PROMPT_VERSION,
              paramsVersion: SUMMARY_PARAMS_VERSION,
            }),
            Math.random,
            summaryGenerationScope(env.AI_SUMMARY_SCOPE, env.AI_SUMMARY_ENTRY_IDS),
            env.AI_SUMMARY_AUTO_PUBLISH === "1",
          );
        }
        message.ack();
      } catch {
        console.error("ai_summary_delivery_error", { jobId: parsed.data.jobId });
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
