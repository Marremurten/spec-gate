import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../src/commands/init.js";
import { remove } from "../src/commands/remove.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-remove-test");

function setup(): string {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  return TEST_DIR;
}

describe("remove command", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("removes all scaffolded files", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    remove(root, false);

    expect(existsSync(join(root, ".claude/skills/check-spec/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/check-diff/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/check-determinism/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/agents/spec-gate-validator.md"))).toBe(false);
    expect(existsSync(join(root, ".spec-gate.json"))).toBe(false);
  });

  it("removes hook from settings.json", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    remove(root, false);

    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf-8"));
    expect(settings.hooks).toBeUndefined();
  });

  it("--data flag deletes .spec-gate/ directory", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: true });
    // Force creates backups in .spec-gate/
    mkdirSync(join(root, ".spec-gate"), { recursive: true });
    writeFileSync(join(root, ".spec-gate/contract.json"), "{}");

    remove(root, true);

    expect(existsSync(join(root, ".spec-gate"))).toBe(false);
  });

  it("handles already-removed files gracefully", () => {
    const root = setup();
    // Don't init — files don't exist
    expect(() => remove(root, false)).not.toThrow();
  });

  it("does not delete non-spec-gate files in skill directories", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    // Add a user file in the skills directory
    writeFileSync(join(root, ".claude/skills/check-spec/custom.md"), "user content");

    remove(root, false);

    // The SKILL.md should be removed, but the custom file and its directory should remain
    expect(existsSync(join(root, ".claude/skills/check-spec/SKILL.md"))).toBe(false);
    expect(existsSync(join(root, ".claude/skills/check-spec/custom.md"))).toBe(true);
  });
});
