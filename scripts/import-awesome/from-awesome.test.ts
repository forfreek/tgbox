import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAwesomeReadme } from "./from-awesome.ts";

const sample = `
## 🔥 Most popular

| [Skip](https://tgbox.cc/en/detail/skipme/) | bot · Utilities | 1 | \`Official\` |

## Channels

### News

| [Solidot](https://tgbox.cc/en/detail/solidot/) | 1 | text \`Daily Digest\` \`Science\` \`Not A Tag\` |
| [Again](https://tgbox.cc/en/detail/solidot/) | 1 | duplicate |

### AI

| [Many](https://tgbox.cc/en/detail/manytags/) | 1 | \`ChatGPT\` \`LLMs\` \`AI Art\` \`AI Coding\` \`AI Agents\` \`Prompts\` |

## Groups

### Chat

| [Hello](https://tgbox.cc/en/detail/hello_world/) | 1 | |

## Bots

### Utilities

| [Father](https://tgbox.cc/en/detail/BotFather/) | 1 | \`Official\` \`Free\` |
`;

test("keeps category sections and maps headings and tag names", () => {
  const parsed = parseAwesomeReadme(sample);
  assert.deepEqual(
    parsed.entries.map((entry) => entry.username),
    ["solidot", "manytags", "hello_world", "BotFather"],
  );
  assert.deepEqual(parsed.entries[0], {
    username: "solidot",
    kind: "channel",
    category: "news",
    tags: ["daily-news", "science"],
  });
  assert.deepEqual(parsed.entries[3], {
    username: "BotFather",
    kind: "bot",
    category: "tools",
    tags: ["official", "free"],
  });
  assert.deepEqual(parsed.duplicateUsernames, ["solidot"]);
  assert.deepEqual(parsed.unknownTags, ["Not A Tag"]);
  assert.deepEqual(parsed.entries[1]?.tags, ["chatgpt", "llm", "ai-art", "ai-coding", "ai-agent"]);
  assert.deepEqual(parsed.truncatedUsernames, ["manytags"]);
});

test("an unknown category heading stops the parse", () => {
  assert.throws(
    () => parseAwesomeReadme("## Channels\n\n### Nowhere\n"),
    /unknown channel heading: Nowhere/,
  );
});
