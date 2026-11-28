/** Small shared policy: safe to bundle without server dependencies. */
export const CLIENT_POLICY = Object.freeze({
  debounceMs: 1500,
  minimumDelay: 500,
  maximumDelay: 5000,
  keywordMin: 2,
  keywordMax: 64,
  bodyBytes: 1024,
});
