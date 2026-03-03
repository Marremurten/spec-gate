import { existsSync } from "node:fs";
import { join } from "node:path";
import { getScaffoldFiles } from "../scaffold/files.js";
import { writeScaffoldFiles } from "../scaffold/writer.js";
import { mergeSettings } from "../scaffold/settings-merge.js";

export function update(projectRoot: string): void {
  const configPath = join(projectRoot, ".spec-gate.json");

  if (!existsSync(configPath)) {
    console.error("\n  Error: .spec-gate.json not found. Run `spec-gate init` first.\n");
    process.exit(1);
  }

  const files = getScaffoldFiles().filter(f => f.category !== "config");
  const results = writeScaffoldFiles(projectRoot, files, true);

  console.log("\n  spec-gate update\n");

  for (const result of results) {
    const icon = result.action === "overwritten" ? "~" : "+";
    const suffix = result.backedUp ? ` (backup: ${result.backedUp})` : "";
    console.log(`  ${icon} ${result.target} [${result.action}]${suffix}`);
  }

  // Re-merge settings (idempotent)
  const { merged } = mergeSettings(projectRoot);
  if (merged) {
    console.log(`  + .claude/settings.json [hook added]`);
  } else {
    console.log(`  - .claude/settings.json [hook already present]`);
  }

  console.log("\n  Updated to latest spec-gate templates.\n");
}
