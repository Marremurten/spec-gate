import { existsSync, unlinkSync, rmSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getScaffoldFiles } from "../scaffold/files.js";
import { removeFromSettings } from "../scaffold/settings-merge.js";

export function remove(projectRoot: string, removeData: boolean): void {
  const files = getScaffoldFiles();
  const dirsToClean = new Set<string>();

  console.log("\n  spec-gate remove\n");

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

  // Clean up empty skill directories only
  for (const dir of dirsToClean) {
    if (existsSync(dir) && readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true });
    }
  }

  const { removed } = removeFromSettings(projectRoot);
  if (removed) {
    console.log(`  - .claude/settings.json [hook removed]`);
  } else {
    console.log(`  - .claude/settings.json [no hook found]`);
  }

  if (removeData) {
    const specGuardDir = join(projectRoot, ".spec-gate");
    if (existsSync(specGuardDir)) {
      rmSync(specGuardDir, { recursive: true });
      console.log(`  - .spec-gate/ [deleted]`);
    }
  }

  console.log("\n  Spec-gate files removed.\n");
}
