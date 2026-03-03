import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ScaffoldFile } from "./files.js";

export interface WriteResult {
  target: string;
  action: "created" | "skipped" | "overwritten";
  backedUp?: string;
}

export function writeScaffoldFiles(
  projectRoot: string,
  files: ScaffoldFile[],
  force: boolean,
): WriteResult[] {
  const results: WriteResult[] = [];

  for (const file of files) {
    const fullPath = join(projectRoot, file.target);
    const dir = dirname(fullPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(fullPath) && !force) {
      results.push({ target: file.target, action: "skipped" });
      continue;
    }

    if (existsSync(fullPath) && force) {
      const backupDir = join(projectRoot, ".spec-guard", "backups");
      mkdirSync(backupDir, { recursive: true });
      const backupName = file.target.replace(/\//g, "__");
      const backupPath = join(backupDir, backupName);
      copyFileSync(fullPath, backupPath);
      results.push({
        target: file.target,
        action: "overwritten",
        backedUp: `.spec-guard/backups/${backupName}`,
      });
    } else {
      results.push({ target: file.target, action: "created" });
    }

    writeFileSync(fullPath, file.content, "utf-8");
  }

  return results;
}
