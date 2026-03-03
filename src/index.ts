import { init } from "./commands/init.js";
import { update } from "./commands/update.js";
import { remove } from "./commands/remove.js";

const args = process.argv.slice(2);
const command = args[0];

function hasFlag(flag: string): boolean {
  return args.includes(`--${flag}`);
}

function printUsage(): void {
  console.log(`
  spec-guard — AI spec validation for Claude Code

  Usage:
    spec-guard init [options]    Scaffold spec-guard files into your project
    spec-guard update            Update scaffold files to latest version
    spec-guard remove [options]  Remove all spec-guard files

  Init options:
    --skills-only   Only install skill files (no hooks/agent)
    --hooks-only    Only install hook agent
    --force         Overwrite existing files (backs up originals)

  Remove options:
    --data          Also remove .spec-guard/ directory (contracts, backups)
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

  default:
    printUsage();
    break;
}
