#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");
const templatesRoot = path.join(packageRoot, "templates", "automations");

const automations = [
  {
    id: "hacker-news",
    name: "Hacker News weekly digest",
    template: "hacker-news/automation.toml"
  },
  {
    id: "weekly-github-trending-digest",
    name: "GitHub Trending weekly digest",
    template: "weekly-github-trending-digest/automation.toml"
  },
  {
    id: "hugging-face",
    name: "Hugging Face Trending Papers weekly digest",
    template: "hugging-face/automation.toml"
  },
  {
    id: "hci",
    name: "HCI weekly paper digest",
    template: "hci/automation.toml"
  },
  {
    id: "v2ex",
    name: "V2EX weekly digest",
    template: "v2ex/automation.toml"
  }
];

main().catch((error) => {
  console.error(`\nInstall failed: ${error.message}`);
  process.exit(1);
});

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    printHelp();
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    const codexHome = expandHome(
      flags.codexHome ||
        process.env.CODEX_HOME ||
        path.join(os.homedir(), ".codex")
    );
    const targetRoot = path.join(codexHome, "automations");

    const defaultDigestPath = path.join(os.homedir(), "Obsidian", "main", "Digest");
    const defaultWorkspace = path.join(os.homedir(), "Project", "Digest");

    const digestPath = expandHome(
      flags.digestPath ||
        (flags.yes
          ? defaultDigestPath
          : await askWithDefault(rl, "Obsidian Digest path", defaultDigestPath))
    );
    const workspace = expandHome(
      flags.workspace ||
        (flags.yes
          ? defaultWorkspace
          : await askWithDefault(rl, "Codex automation workspace", defaultWorkspace))
    );

    const selected = await selectAutomations(rl, flags);

    if (!flags.dryRun) {
      await fs.mkdir(targetRoot, { recursive: true });
      await fs.mkdir(digestPath, { recursive: true });
      await fs.mkdir(workspace, { recursive: true });
    }

    console.log("");
    console.log(flags.dryRun ? "Previewing install:" : "Installing automations:");

    for (const automation of selected) {
      await installAutomation({
        automation,
        digestPath,
        workspace,
        targetRoot,
        flags,
        rl
      });
    }

    console.log("");
    console.log(flags.dryRun ? "Dry run complete. No files were written." : "Done.");
    console.log(`Codex automations directory: ${targetRoot}`);
    console.log(`Digest path: ${digestPath}`);
    console.log(`Workspace: ${workspace}`);
  } finally {
    rl.close();
  }
}

async function selectAutomations(rl, flags) {
  if (flags.only) {
    const wanted = new Set(flags.only.split(",").map((item) => item.trim()).filter(Boolean));
    const selected = automations.filter((automation) => wanted.has(automation.id));
    const missing = [...wanted].filter(
      (id) => !automations.some((automation) => automation.id === id)
    );

    if (missing.length > 0) {
      throw new Error(`Unknown automation id: ${missing.join(", ")}`);
    }

    return selected;
  }

  if (flags.yes) {
    return automations;
  }

  const selected = [];
  console.log("");
  console.log("Choose automations to install:");

  for (const automation of automations) {
    const answer = await askWithDefault(rl, `${automation.name}? [Y/n]`, "Y");
    if (answer.toLowerCase() !== "n" && answer.toLowerCase() !== "no") {
      selected.push(automation);
    }
  }

  if (selected.length === 0) {
    throw new Error("No automations selected.");
  }

  return selected;
}

async function installAutomation({ automation, digestPath, workspace, targetRoot, flags, rl }) {
  const templatePath = path.join(templatesRoot, automation.template);
  const targetDir = path.join(targetRoot, automation.id);
  const targetFile = path.join(targetDir, "automation.toml");
  const rawTemplate = await fs.readFile(templatePath, "utf8");
  const rendered = rawTemplate
    .replaceAll("__DIGEST_PATH__", escapeTomlString(digestPath))
    .replaceAll("__WORKSPACE_DIR__", escapeTomlString(workspace));

  const exists = await pathExists(targetFile);

  if (flags.dryRun) {
    console.log(`- ${automation.id} -> ${targetFile}${exists ? " (exists)" : ""}`);
    return;
  }

  if (exists && !flags.force) {
    if (flags.yes) {
      await backupFile(targetFile);
    } else {
      const choice = await askWithDefault(
        rl,
        `${automation.id} already exists. Replace and back up old file? [Y/n]`,
        "Y"
      );
      if (choice.toLowerCase() === "n" || choice.toLowerCase() === "no") {
        console.log(`- skipped ${automation.id}`);
        return;
      }
      await backupFile(targetFile);
    }
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetFile, rendered, "utf8");
  console.log(`- installed ${automation.id}`);
}

async function backupFile(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak-${stamp}`;
  await fs.copyFile(filePath, backupPath);
}

async function askWithDefault(rl, question, defaultValue) {
  const answer = await rl.question(`${question} (${defaultValue}): `);
  return answer.trim() || defaultValue;
}

function parseArgs(args) {
  const flags = {
    yes: false,
    dryRun: false,
    force: false,
    help: false,
    digestPath: "",
    workspace: "",
    codexHome: "",
    only: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
    } else if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--digest-path") {
      flags.digestPath = readValue(args, ++index, arg);
    } else if (arg.startsWith("--digest-path=")) {
      flags.digestPath = arg.slice("--digest-path=".length);
    } else if (arg === "--workspace") {
      flags.workspace = readValue(args, ++index, arg);
    } else if (arg.startsWith("--workspace=")) {
      flags.workspace = arg.slice("--workspace=".length);
    } else if (arg === "--codex-home") {
      flags.codexHome = readValue(args, ++index, arg);
    } else if (arg.startsWith("--codex-home=")) {
      flags.codexHome = arg.slice("--codex-home=".length);
    } else if (arg === "--only") {
      flags.only = readValue(args, ++index, arg);
    } else if (arg.startsWith("--only=")) {
      flags.only = arg.slice("--only=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function expandHome(value) {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return path.resolve(value);
}

function escapeTomlString(value) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`create-codex-info-automations

Usage:
  npx create-codex-info-automations
  npx create-codex-info-automations --yes
  npx create-codex-info-automations --only hacker-news,v2ex

Options:
  -y, --yes              Install all automations with default paths
  --dry-run              Preview files without writing
  --force                Replace existing automations without backing up
  --digest-path <path>   Obsidian Digest folder
  --workspace <path>     Working directory for Codex automation runs
  --codex-home <path>    Codex config directory, defaults to ~/.codex
  --only <ids>           Comma-separated automation ids
  -h, --help             Show help

Automation ids:
  ${automations.map((automation) => automation.id).join("\n  ")}
`);
}
