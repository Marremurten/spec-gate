import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mergeSettings, removeFromSettings } from "../src/scaffold/settings-merge.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-settings-test");

function setup(settings?: object): string {
  rmSync(TEST_DIR, { recursive: true, force: true });
  mkdirSync(TEST_DIR, { recursive: true });
  if (settings !== undefined) {
    const claudeDir = join(TEST_DIR, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }
  return TEST_DIR;
}

function readSettings(root: string): Record<string, unknown> {
  const raw = readFileSync(join(root, ".claude", "settings.json"), "utf-8");
  return JSON.parse(raw);
}

describe("settings-merge", () => {
  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("mergeSettings", () => {
    it("creates settings.json when missing", () => {
      const root = setup();
      const { merged } = mergeSettings(root);

      expect(merged).toBe(true);
      const settings = readSettings(root);
      expect(settings.hooks).toBeDefined();
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.Stop[0]).toEqual({
        hooks: [{ type: "agent", agent: "spec-gate-validator" }],
      });
    });

    it("merges into empty settings", () => {
      const root = setup({});
      const { merged } = mergeSettings(root);

      expect(merged).toBe(true);
      const settings = readSettings(root);
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
    });

    it("preserves existing hooks and non-hook keys", () => {
      const root = setup({
        permissions: { allow: ["Read"] },
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo done" }] }],
          PreToolUse: [{ hooks: [{ type: "command", command: "echo pre" }] }],
        },
      });

      const { merged } = mergeSettings(root);

      expect(merged).toBe(true);
      const settings = readSettings(root);
      expect(settings.permissions).toEqual({ allow: ["Read"] });
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(2);
      expect(hooks.Stop[0]).toEqual({ hooks: [{ type: "command", command: "echo done" }] });
      expect(hooks.Stop[1]).toEqual({ hooks: [{ type: "agent", agent: "spec-gate-validator" }] });
      expect(hooks.PreToolUse).toHaveLength(1);
    });

    it("is idempotent — no duplicates on re-run", () => {
      const root = setup({});

      mergeSettings(root);
      const { merged } = mergeSettings(root);

      expect(merged).toBe(false);
      const settings = readSettings(root);
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
    });

    it("detects existing spec-gate hook by agent name", () => {
      const root = setup({
        hooks: {
          Stop: [{ hooks: [{ type: "agent", agent: "spec-gate-validator" }] }],
        },
      });

      const { merged } = mergeSettings(root);
      expect(merged).toBe(false);
    });

    it("detects existing spec-gate hook by prompt content", () => {
      const root = setup({
        hooks: {
          Stop: [{ hooks: [{ type: "prompt", prompt: "Run spec-gate check" }] }],
        },
      });

      const { merged } = mergeSettings(root);
      expect(merged).toBe(false);
    });

    it("migrates old flat-format entries to matcher-group format", () => {
      const root = setup({
        hooks: {
          Stop: [{ type: "command", command: "echo done" }],
        },
      });

      const { merged } = mergeSettings(root);

      expect(merged).toBe(true);
      const settings = readSettings(root);
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(2);
      // Old flat entry should be wrapped
      expect(hooks.Stop[0]).toEqual({ hooks: [{ type: "command", command: "echo done" }] });
      // New spec-gate entry in new format
      expect(hooks.Stop[1]).toEqual({ hooks: [{ type: "agent", agent: "spec-gate-validator" }] });
    });

    it("creates backup before modifying", () => {
      const root = setup({ existing: true });
      const { backupPath } = mergeSettings(root);

      expect(backupPath).toMatch(/^\.spec-gate\/backups\/settings\.json\.\d+\.bak$/);
      const backupDir = join(root, ".spec-gate", "backups");
      const backups = readdirSync(backupDir);
      expect(backups.some((f: string) => f.startsWith("settings.json.") && f.endsWith(".bak"))).toBe(true);
    });
  });

  describe("removeFromSettings", () => {
    it("removes spec-gate hook entries", () => {
      const root = setup({
        hooks: {
          Stop: [
            { hooks: [{ type: "command", command: "echo done" }] },
            { hooks: [{ type: "agent", agent: "spec-gate-validator" }] },
          ],
        },
      });

      const { removed } = removeFromSettings(root);

      expect(removed).toBe(true);
      const settings = readSettings(root);
      const hooks = settings.hooks as Record<string, unknown[]>;
      expect(hooks.Stop).toHaveLength(1);
      expect(hooks.Stop[0]).toEqual({ hooks: [{ type: "command", command: "echo done" }] });
    });

    it("cleans up empty Stop array and hooks object", () => {
      const root = setup({
        hooks: {
          Stop: [{ hooks: [{ type: "agent", agent: "spec-gate-validator" }] }],
        },
      });

      const { removed } = removeFromSettings(root);

      expect(removed).toBe(true);
      const settings = readSettings(root);
      expect(settings.hooks).toBeUndefined();
    });

    it("returns removed=false when no spec-gate hooks exist", () => {
      const root = setup({
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "echo done" }] }],
        },
      });

      const { removed } = removeFromSettings(root);
      expect(removed).toBe(false);
    });

    it("returns removed=false when settings.json is missing", () => {
      const root = setup();
      const { removed } = removeFromSettings(root);
      expect(removed).toBe(false);
    });
  });
});
