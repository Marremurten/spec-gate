import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";

const SPEC_GATE_MARKER = "spec-gate";

interface HookEntry {
  type: string;
  agent?: string;
  prompt?: string;
  command?: string;
  [key: string]: unknown;
}

interface Settings {
  hooks?: {
    Stop?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function getSettingsPath(projectRoot: string): string {
  return join(projectRoot, ".claude", "settings.json");
}

function readSettings(settingsPath: string): Settings {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const raw = readFileSync(settingsPath, "utf-8");
  try {
    return JSON.parse(raw) as Settings;
  } catch {
    console.error(`  Warning: could not parse ${settingsPath} — treating as empty.`);
    return {};
  }
}

function backupSettings(settingsPath: string, projectRoot: string): string | null {
  if (!existsSync(settingsPath)) return null;
  const backupDir = join(projectRoot, ".spec-gate", "backups");
  mkdirSync(backupDir, { recursive: true });
  const ts = Date.now();
  const backupPath = join(backupDir, `settings.json.${ts}.bak`);
  copyFileSync(settingsPath, backupPath);
  return `.spec-gate/backups/settings.json.${ts}.bak`;
}

function isSpecGuardHook(entry: HookEntry): boolean {
  const prompt = entry.prompt || "";
  const agent = entry.agent || "";
  return prompt.includes(SPEC_GATE_MARKER) || agent.includes(SPEC_GATE_MARKER);
}

function getSpecGuardHook(): HookEntry {
  return {
    type: "agent",
    agent: "spec-gate-validator",
  };
}

export function mergeSettings(projectRoot: string): { merged: boolean; backupPath: string | null } {
  const settingsPath = getSettingsPath(projectRoot);
  const dir = dirname(settingsPath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const settings = readSettings(settingsPath);
  const backupPath = backupSettings(settingsPath, projectRoot);

  if (!settings.hooks) {
    settings.hooks = {};
  }

  if (!settings.hooks.Stop) {
    settings.hooks.Stop = [];
  }

  const stopHooks = settings.hooks.Stop as HookEntry[];
  const alreadyExists = stopHooks.some(isSpecGuardHook);

  if (alreadyExists) {
    return { merged: false, backupPath };
  }

  stopHooks.push(getSpecGuardHook());
  settings.hooks.Stop = stopHooks;

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return { merged: true, backupPath };
}

export function removeFromSettings(projectRoot: string): { removed: boolean; backupPath: string | null } {
  const settingsPath = getSettingsPath(projectRoot);

  if (!existsSync(settingsPath)) {
    return { removed: false, backupPath: null };
  }

  const settings = readSettings(settingsPath);
  const backupPath = backupSettings(settingsPath, projectRoot);

  if (!settings.hooks?.Stop) {
    return { removed: false, backupPath };
  }

  const stopHooks = settings.hooks.Stop as HookEntry[];
  const filtered = stopHooks.filter((entry) => !isSpecGuardHook(entry));

  if (filtered.length === stopHooks.length) {
    return { removed: false, backupPath };
  }

  if (filtered.length === 0) {
    delete settings.hooks.Stop;
  } else {
    settings.hooks.Stop = filtered;
  }

  // Clean up empty hooks object
  if (settings.hooks && Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return { removed: true, backupPath };
}
