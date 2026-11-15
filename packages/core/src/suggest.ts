import {
  CATEGORY_MAX_TOKENS,
  CATEGORY_MODEL,
  CATEGORY_SYSTEM,
  type CategoryClassifier,
  categoryClassifierPrompt,
  categorySlugFromModel,
} from "@tgbox/shared";

/**
 * The Workers AI half of `suggestTaxonomy` (@tgbox/shared), used by the bot's `/submit` flow and
 * the Mini App's preview endpoint so both propose the same category.
 *
 * It only runs when the keyword pass is unsure, which is a minority of submissions, and a
 * submission is a deliberate human act a few times a day — so one call per unsure submission is
 * well inside the free 10,000 Neurons/day (see `.agents/cloudflare.md`). The prompt itself lives
 * in @tgbox/shared: the awesome-list container asks the same model the same question.
 */

/**
 * Calls per UTC day, per isolate. The Mini App's preview endpoint is reachable by any Telegram
 * user, so without a ceiling one persistent caller could spend the account's whole daily Neuron
 * allowance — and the hourly description translations would start failing with it. Deliberately
 * approximate (isolates are per colo, like the preview rate limit): this is a cap, not accounting.
 * 200 calls is ~800 Neurons, well inside what the translations leave over.
 */
const MAX_CALLS_PER_DAY = 200;
const DAY_MS = 24 * 60 * 60 * 1000;
let day = 0;
let calls = 0;

function withinBudget(now: number) {
  const today = Math.floor(now / DAY_MS);
  if (today !== day) {
    day = today;
    calls = 0;
  }
  if (calls >= MAX_CALLS_PER_DAY) return false;
  calls++;
  return true;
}

/**
 * Builds the classifier hook for `suggestTaxonomy`. Every failure — a refused call, a spent budget,
 * an exhausted neuron allowance, a model that answers prose — returns null, which
 * `suggestTaxonomy` turns into "no suggestion" rather than a wrong one.
 */
export function aiCategoryClassifier(ai: Ai): CategoryClassifier {
  return async (request) => {
    if (!withinBudget(Date.now())) return null;
    try {
      const result = await ai.run(CATEGORY_MODEL, {
        messages: [
          { role: "system", content: CATEGORY_SYSTEM },
          { role: "user", content: categoryClassifierPrompt(request) },
        ],
        max_tokens: CATEGORY_MAX_TOKENS,
        temperature: 0,
      });
      return categorySlugFromModel(result);
    } catch (error) {
      console.error("category classification failed", error);
      return null;
    }
  };
}
