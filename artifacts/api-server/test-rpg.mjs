import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "pixel-rpg-tests-"));
try {
  const out = join(dir, "tests.cjs");
  await build({ entryPoints: ["src/lib/rpg-game.test.ts"], outfile: out, bundle: true, platform: "node", format: "cjs", external: ["pg-native"], logLevel: "warning" });
  const result = spawnSync(process.execPath, ["--test", out], { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }
