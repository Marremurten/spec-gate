import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { init } from "../src/commands/init.js";
import { update } from "../src/commands/update.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-update-test");

function setup(): string {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  return TEST_DIR;
}

describe("update command", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("fails if .spec-gate.json does not exist", () => {
    const root = setup();
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    expect(() => update(root)).toThrow("process.exit called");
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it("overwrites existing template files and creates backups", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    // Modify a skill file
    writeFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "old content");

    update(root);

    const content = readFileSync(join(root, ".claude/skills/check-spec/SKILL.md"), "utf-8");
    expect(content).toContain("name: check-spec");
    expect(content).not.toBe("old content");

    // Backup should exist in .spec-gate/backups/
    const backups = readdirSync(join(root, ".spec-gate/backups"));
    const skillBackup = backups.find((f: string) => f.startsWith(".claude__skills__check-spec__SKILL.md"));
    expect(skillBackup).toBeDefined();
  });

  it("does NOT overwrite config file", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    // Customize config
    const configPath = join(root, ".spec-gate.json");
    const customConfig = JSON.stringify({ custom: true }, null, 2);
    writeFileSync(configPath, customConfig);

    update(root);

    const content = readFileSync(configPath, "utf-8");
    expect(content).toBe(customConfig);
  });

  it("re-merges settings idempotently", () => {
    const root = setup();
    init(root, { skillsOnly: false, hooksOnly: false, force: false });

    update(root);

    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf-8"));
    const hooks = settings.hooks.Stop;
    // Should still have exactly one spec-gate hook
    const specGateHooks = hooks.filter((h: any) => h.agent === "spec-gate-validator");
    expect(specGateHooks).toHaveLength(1);
  });
});
