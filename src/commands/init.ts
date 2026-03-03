import { getScaffoldFiles } from "../scaffold/files.js";
import { writeScaffoldFiles } from "../scaffold/writer.js";
import { mergeSettings } from "../scaffold/settings-merge.js";

interface InitOptions {
  skillsOnly: boolean;
  hooksOnly: boolean;
  force: boolean;
}

export function init(projectRoot: string, options: InitOptions): void {
  const allFiles = getScaffoldFiles();

  let files = allFiles;
  if (options.skillsOnly) {
    files = allFiles.filter((f) => f.category === "skill");
  } else if (options.hooksOnly) {
    files = allFiles.filter((f) => f.category === "agent" || f.category === "hook");
  }

  // Always include config unless filtering to hooks-only
  if (!options.hooksOnly) {
    const configFile = allFiles.find((f) => f.category === "config");
    if (configFile && !files.includes(configFile)) {
      files.push(configFile);
    }
  }

  const results = writeScaffoldFiles(projectRoot, files, options.force);

  console.log("\n  spec-gate init\n");

  for (const result of results) {
    const icon = result.action === "created" ? "+" : result.action === "skipped" ? "-" : "~";
    const suffix = result.backedUp ? ` (backup: ${result.backedUp})` : "";
    console.log(`  ${icon} ${result.target} [${result.action}]${suffix}`);
  }

  // Merge settings unless skills-only
  if (!options.skillsOnly) {
    const { merged, backupPath } = mergeSettings(projectRoot);
    if (merged) {
      console.log(`  + .claude/settings.json [hook added]`);
      if (backupPath) {
        console.log(`    (backup: ${backupPath})`);
      }
    } else {
      console.log(`  - .claude/settings.json [hook already exists]`);
    }
  }

  console.log(`
  Done! Available commands:
    /check-spec [path|phase]  — Score spec determinism (Gate 1)
    /check-diff [base-branch] — Validate diff against contract (Gate 2)
  `);
}
