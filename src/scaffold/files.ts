import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ScaffoldFile {
  /** Relative path from project root where this file is written */
  target: string;
  /** File content */
  content: string;
  /** Category for filtering with --skills-only / --hooks-only */
  category: "skill" | "hook" | "config" | "agent";
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function readTemplate(name: string): string {
  // In source: __dirname = src/scaffold/, templates at src/templates/
  // In built: __dirname = dist/, templates at dist/templates/
  const fromScaffold = join(__dirname, "..", "templates", name);
  const fromDist = join(__dirname, "templates", name);
  const templatePath = existsSync(fromScaffold) ? fromScaffold : fromDist;
  return readFileSync(templatePath, "utf-8");
}

export function getScaffoldFiles(): ScaffoldFile[] {
  return [
    {
      target: ".claude/skills/check-spec/SKILL.md",
      content: readTemplate("check-spec.md"),
      category: "skill",
    },
    {
      target: ".claude/skills/check-diff/SKILL.md",
      content: readTemplate("check-diff.md"),
      category: "skill",
    },
    {
      target: ".claude/skills/check-determinism/SKILL.md",
      content: readTemplate("check-determinism.md"),
      category: "skill",
    },
    {
      target: ".claude/agents/spec-gate-validator.md",
      content: readTemplate("validator-agent.md"),
      category: "agent",
    },
    {
      target: ".spec-gate.json",
      content: readTemplate("spec-gate-config.json"),
      category: "config",
    },
  ];
}
