import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../src/commands/init.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-init-test");

function setup(): string {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  return TEST_DIR;
}

describe("init command", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates all expected files on fresh init", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    expect(existsSync(join(root, ".claude/skills/check-spec/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/check-diff/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/check-determinism/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/agents/spec-guard-validator.md"))).toBe(true);
    expect(existsSync(join(root, ".spec-guard.json"))).toBe(true);
    expect(existsSync(join(root, ".claude/settings.json"))).toBe(true);
  });

  it("skill files contain correct frontmatter", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    const checkSpec = readFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "utf-8");
    expect(checkSpec).toContain("name: check-spec");
    expect(checkSpec).toContain("argument-hint:");

    const checkDiff = readFileSync(join(root, ".claude/skills/check-diff/SKILL.md"), "utf-8");
    expect(checkDiff).toContain("name: check-diff");
    expect(checkDiff).toContain("disable-model-invocation: true");

    const checkDet = readFileSync(join(root, ".claude/skills/check-determinism/SKILL.md"), "utf-8");
    expect(checkDet).toContain("name: check-determinism");
    expect(checkDet).toContain("argument-hint:");
  });

  it("--skills-only only installs skills and config", () => {
    const root = setup();
    init(root, { skillsOnly: true, hooksOnly: false, force: false });

    expect(existsSync(join(root, ".claude/skills/check-spec/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/check-diff/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/check-determinism/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".spec-guard.json"))).toBe(true);
    expect(existsSync(join(root, ".claude/agents/spec-guard-validator.md"))).toBe(false);
    // settings.json should NOT have hook when --skills-only
    expect(existsSync(join(root, ".claude/settings.json"))).toBe(false);
  });

  it("--hooks-only only installs agent", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: true, force: false });

    expect(existsSync(join(root, ".claude/agents/spec-guard-validator.md"))).toBe(true);
    expect(existsSync(join(root, ".claude/skills/check-spec/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/check-diff/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/check-determinism/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".spec-guard.json"))).toBe(false);
  });

  it("does not overwrite existing files without --force", () => {
    const root = setup();
    // Pre-create a skill file with custom content
    mkdirSync(join(root, ".claude/skills/check-spec"), { recursive: true });
    writeFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "custom content");

    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    const content = readFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "utf-8");
    expect(content).toBe("custom content");
  });

  it("overwrites existing files with --force and creates backups", () => {
    const root = setup();
    // Pre-create a skill file with custom content
    mkdirSync(join(root, ".claude/skills/check-spec"), { recursive: true });
    writeFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "custom content");

    init(root, { skillsOnly: false, hooksOnly: false, force: true });

    const content = readFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "utf-8");
    expect(content).not.toBe("custom content");
    expect(content).toContain("name: check-spec");

    // Backup should exist
    const backupPath = join(root, ".spec-guard/backups/.claude__skills__check-spec__SKILL.md");
    expect(existsSync(backupPath)).toBe(true);
    const backupContent = readFileSync(backupPath, "utf-8");
    expect(backupContent).toBe("custom content");
  });

  it("settings.json contains Stop hook after init", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf-8"));
    expect(settings.hooks.Stop).toEqual([
      { type: "agent", agent: "spec-guard-validator" },
    ]);
  });
});
