/** The reviewed combination. Changing it requires a new prompt evaluation. */
export const SUMMARY_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SUMMARY_PROMPT_VERSION = "summary-prompt-v8";
export const SUMMARY_PARAMS_VERSION = "summary-params-v3";
export type SummaryVersions = { promptVersion: string; paramsVersion: string };
export function supportedSummaryConfig(config: SummaryVersions & { model: string }) {
  return (
    config.model === SUMMARY_MODEL &&
    config.promptVersion === SUMMARY_PROMPT_VERSION &&
    config.paramsVersion === SUMMARY_PARAMS_VERSION
  );
}
