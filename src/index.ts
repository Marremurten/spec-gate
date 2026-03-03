import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { remove } from "./commands/remove.js";

declare const __VERSION__: string;

const args = process.argv.slice(2);
const command = args[0];

function hasFlag(flag: string): boolean {
  return args.includes(`--${flag}`);
}

function printUsage(): void {
  console.log(`
  spec-gate — AI spec validation for Claude Code

  Usage:
    spec-gate init [options]    Scaffold spec-gate files into your project
    spec-gate update            Update scaffold files to latest version
    spec-gate remove [options]  Remove all spec-gate files

  Init options:
    --skills-only   Only install skill files (no hooks/agent)
    --hooks-only    Only install hook agent
    --force         Overwrite existing files (backs up originals)

  Remove options:
    --data          Also remove .spec-gate/ directory (contracts, backups)

  Other:
    --version, -v   Print version
  `);
}

const projectRoot = process.cwd();

switch (command) {
  case "init":
    init(projectRoot, {
      skillsOnly: hasFlag("skills-only"),
      hooksOnly: hasFlag("hooks-only"),
      force: hasFlag("force"),
    });
    break;

  case "update":
    update(projectRoot);
    break;

  case "remove":
    remove(projectRoot, hasFlag("data"));
    break;

  case "--version":
  case "-v":
    console.log(__VERSION__);
    break;

  default:
    printUsage();
    break;
}
