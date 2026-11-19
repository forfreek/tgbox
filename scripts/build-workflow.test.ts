import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "/bin/bash";

test("verify-only workflow cannot deploy, clear the dirty flag or dispatch downstream builds", () => {
  const yaml = readFileSync(
    new URL("../.github/workflows/build-deploy.yml", import.meta.url),
    "utf8",
  );
  for (const name of [
    "Deploy web",
    "Smoke-check the deployed site",
    "Clear dirty flag",
    "Tell the awesome list to regenerate",
  ]) {
    const step = yaml.split(`      - name: ${name}`)[1]?.split("      - name:")[0];
    assert.ok(step, name);
    assert.match(step, /if: .*&& !inputs\.verify_only/, name);
  }
  const build = yaml
    .split("      - name: Export D1, snapshot, astro build, Pagefind")[1]
    ?.split("      - name:")[0];
  assert.ok(build && !build.includes("!inputs.verify_only"));
});

test("deployment probe distinguishes WAF challenges from real HTTP failures", {
  skip: !existsSync(bash),
}, () => {
  const yaml = readFileSync(
    new URL("../.github/workflows/build-deploy.yml", import.meta.url),
    "utf8",
  );
  const block = yaml
    .split("      - name: Smoke-check the deployed site")[1]
    ?.split("      - name:")[0];
  assert.ok(block);
  const script = block
    .split("        run: |")[1]
    ?.split(/\r?\n/)
    .filter((line) => line.startsWith("          "))
    .map((line) => line.slice(10))
    .join("\n");
  assert.ok(script);
  const dir = mkdtempSync(path.join(tmpdir(), "tgbox-probe-"));
  try {
    mkdirSync(path.join(dir, "apps/web/dist/client/pagefind"), { recursive: true });
    mkdirSync(path.join(dir, "bin"));
    writeFileSync(
      path.join(dir, "apps/web/dist/client/index.html"),
      '<link rel="canonical" href="https://site.example/">',
    );
    writeFileSync(path.join(dir, "apps/web/dist/client/pagefind/pagefind.js"), "// index");
    writeFileSync(path.join(dir, "probe.sh"), `export PATH="$PWD/bin:$PATH"\n${script}\n`);
    writeFileSync(path.join(dir, "bin/sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    writeFileSync(
      path.join(dir, "bin/curl"),
      `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -D) headers="$2"; shift 2 ;;
    -o) body="$2"; shift 2 ;;
    -w|--max-time|-A) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '' > "$headers"
printf '<link rel="canonical" href="https://site.example/">' > "$body"
code=200
case "$SMOKE_MODE:$url" in
  home-challenge:*/|pagefind-challenge:*/pagefind/pagefind.js)
    printf 'cf-mitigated: challenge\\r\\n' > "$headers"; code=403 ;;
  home-denied:*/) code=403 ;;
  pagefind-missing:*/pagefind/pagefind.js) code=404 ;;
esac
printf '%s' "$code"
`,
      { mode: 0o755 },
    );
    for (const [mode, status, marker] of [
      ["ok", 0, "live canonical"],
      ["home-challenge", 0, "::warning::"],
      ["pagefind-challenge", 0, "online search verification remains incomplete"],
      ["home-denied", 1, "::error::"],
      ["pagefind-missing", 1, "::error::"],
    ] as const) {
      const result = spawnSync(bash, ["-e", "probe.sh"], {
        cwd: dir,
        encoding: "utf8",
        timeout: 20_000,
        env: { ...process.env, SITE_URL: "https://site.example", SMOKE_MODE: mode },
      });
      assert.equal(result.status, status, `${mode}: ${result.stdout}\n${result.stderr}`);
      assert.ok(result.stdout.includes(marker), `${mode}: ${result.stdout}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
