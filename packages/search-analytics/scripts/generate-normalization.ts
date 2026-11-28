import { writeFile } from "node:fs/promises";
import { URL } from "node:url";
import { Converter } from "opencc-js/t2cn";

// Offline only. Runtime imports a small plain object, never OpenCC's tries/dictionaries.
// Character folding is deliberately lexical, not semantic translation or phrase conversion.
const convert = Converter({ from: "tw", to: "cn" });
const map: Record<string, string> = {};
for (const [start, end] of [
  [0x3400, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x323af],
] as const) {
  for (let code = start; code <= end; code++) {
    const char = String.fromCodePoint(code);
    const folded = convert(char);
    if (folded !== char) map[char] = folded;
  }
}
if (process.argv.includes("--check")) {
  const { characterFold } = await import("../src/character-fold.gen.ts");
  if (JSON.stringify(characterFold) !== JSON.stringify(map))
    throw new Error("Regenerate analytics character folds");
  console.log("Character folds match locked OpenCC data");
} else {
  const output =
    "// Generated from opencc-js 1.4.2, tw -> cn, individual Unicode characters.\n" +
    "// Run pnpm --filter @tgbox/search-analytics generate:normalization.\n" +
    "export const characterFold: Readonly<Record<string, string>> = " +
    JSON.stringify(map, null, 2) +
    ";\n";
  await writeFile(new URL("../src/character-fold.gen.ts", import.meta.url), output);
  console.log(
    "Generated",
    Object.keys(map).length,
    "character folds;",
    Buffer.byteLength(output),
    "bytes",
  );
}
