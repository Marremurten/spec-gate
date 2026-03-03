import { existsSync } from "node:fs";
import { join } from "node:path";
import { getScaffoldFiles } from "../scaffold/files.js";
import { writeScaffoldFiles } from "../scaffold/writer.js";
import { mergeSettings } from "../scaffold/settings-merge.js";

export function update(projectRoot: string): void {
  const configPath = join(projectRoot, ".spec-guard.json");

  if (!existsSync(configPath)) {
    console.error("\n  Error: .spec-guard.json not found. Run `spec-guard init` first.\n");
    process.exit(1);
  }

  const files = getScaffoldFiles();
  const results = writeScaffoldFiles(projectRoot, files, true);

  console.log("\n  spec-guard update\n");

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

  console.log("\n  Updated to latest spec-guard templates.\n");
}
