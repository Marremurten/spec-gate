import { existsSync, unlinkSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { getScaffoldFiles } from "../scaffold/files.js";
import { removeFromSettings } from "../scaffold/settings-merge.js";

export function remove(projectRoot: string, removeData: boolean): void {
  const files = getScaffoldFiles();
  const dirsToClean = new Set<string>();

  console.log("\n  spec-guard remove\n");

  for (const file of files) {
    const fullPath = join(projectRoot, file.target);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
      console.log(`  - ${file.target} [deleted]`);
      // Track parent dirs of skill files for cleanup
      const parentDir = dirname(fullPath);
      if (file.category === "skill") {
        dirsToClean.add(parentDir);
      }
    } else {
      console.log(`  - ${file.target} [not found]`);
    }
  }

  // Clean up empty skill directories
  for (const dir of dirsToClean) {
    if (existsSync(dir)) {
      try {
        rmSync(dir, { recursive: true });
      } catch {
        // Directory not empty or other issue, skip
      }
    }
  }

  const { removed } = removeFromSettings(projectRoot);
  if (removed) {
    console.log(`  - .claude/settings.json [hook removed]`);
  } else {
    console.log(`  - .claude/settings.json [no hook found]`);
  }

  if (removeData) {
    const specGuardDir = join(projectRoot, ".spec-guard");
    if (existsSync(specGuardDir)) {
      rmSync(specGuardDir, { recursive: true });
      console.log(`  - .spec-guard/ [deleted]`);
    }
  }

  console.log("\n  Spec-guard files removed.\n");
}
