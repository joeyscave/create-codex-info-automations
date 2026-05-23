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
    name: "Hacker News 周报",
    template: "hacker-news/automation.toml"
  },
  {
    id: "weekly-github-trending-digest",
    name: "GitHub Trending 周报",
    template: "weekly-github-trending-digest/automation.toml"
  },
  {
    id: "hugging-face",
    name: "Hugging Face Trending Papers 周报",
    template: "hugging-face/automation.toml"
  },
  {
    id: "hci",
    name: "HCI 论文周报",
    template: "hci/automation.toml"
  },
  {
    id: "v2ex",
    name: "V2EX 周报",
    template: "v2ex/automation.toml"
  }
];

main().catch((error) => {
  console.error(`\n安装失败：${error.message}`);
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
        (flags.yes ? defaultDigestPath : await askDigestPath(rl, defaultDigestPath))
    );
    const workspace = expandHome(
      flags.workspace ||
        (flags.yes ? defaultWorkspace : await askWorkspacePath(rl, defaultWorkspace))
    );

    const selected = await selectAutomations(rl, flags);

    if (!flags.dryRun) {
      await fs.mkdir(targetRoot, { recursive: true });
      await fs.mkdir(digestPath, { recursive: true });
      await fs.mkdir(workspace, { recursive: true });
    }

    console.log("");
    console.log(flags.dryRun ? "安装预览：" : "正在安装自动化：");

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
    console.log(flags.dryRun ? "预览完成，没有写入任何文件。" : "安装完成。");
    console.log(`Codex 自动化目录：${targetRoot}`);
    console.log(`Digest 输出目录：${digestPath}`);
    console.log(`运行工作目录：${workspace}`);
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
      throw new Error(`未知的自动化 id：${missing.join(", ")}`);
    }

    return selected;
  }

  if (flags.yes) {
    return automations;
  }

  const selected = [];
  console.log("");
  console.log("请选择要安装的自动化：");

  for (const automation of automations) {
    const answer = await askWithDefault(rl, `安装「${automation.name}」？[Y/n]`, "Y");
    if (answer.toLowerCase() !== "n" && answer.toLowerCase() !== "no") {
      selected.push(automation);
    }
  }

  if (selected.length === 0) {
    throw new Error("没有选择任何自动化。");
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
    console.log(`- ${automation.id} -> ${targetFile}${exists ? "（已存在）" : ""}`);
    return;
  }

  if (exists && !flags.force) {
    if (flags.yes) {
      await backupFile(targetFile);
    } else {
      const choice = await askWithDefault(
        rl,
        `${automation.id} 已存在。是否备份旧文件并替换？[Y/n]`,
        "Y"
      );
      if (choice.toLowerCase() === "n" || choice.toLowerCase() === "no") {
        console.log(`- 已跳过 ${automation.id}`);
        return;
      }
      await backupFile(targetFile);
    }
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetFile, rendered, "utf8");
  console.log(`- 已安装 ${automation.id}`);
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

async function askDigestPath(rl, defaultValue) {
  console.log("");
  console.log("第 1 步：设置 Obsidian Digest 输出目录");
  console.log("作用：自动化生成的周报会写入这个文件夹，方便你在 Obsidian 里长期保存和检索。");
  console.log("通用示例：~/Obsidian/Main/Digest");
  return askPathWithoutShowingDefault(rl, "请输入你的 Digest 输出目录", defaultValue);
}

async function askWorkspacePath(rl, defaultValue) {
  console.log("");
  console.log("第 2 步：设置 Codex 自动化运行目录");
  console.log("作用：Codex 会在这个目录里运行自动化任务，适合放临时文件、脚本或抓取过程中产生的中间内容。");
  console.log("通用示例：~/Projects/Digest");
  return askPathWithoutShowingDefault(rl, "请输入你的运行工作目录", defaultValue);
}

async function askPathWithoutShowingDefault(rl, question, defaultValue) {
  const answer = await rl.question(`${question}（直接回车使用默认位置）: `);
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
      throw new Error(`未知参数：${arg}`);
    }
  }

  return flags;
}

function readValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} 需要一个值`);
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

用法：
  npx create-codex-info-automations
  npx create-codex-info-automations --yes
  npx create-codex-info-automations --only hacker-news,v2ex

选项：
  -y, --yes              使用默认路径安装全部自动化
  --dry-run              只预览，不写入文件
  --force                直接替换已有自动化，不备份
  --digest-path <path>   Obsidian Digest 输出目录
  --workspace <path>     Codex 自动化运行工作目录
  --codex-home <path>    Codex 配置目录，默认是 ~/.codex
  --only <ids>           只安装指定自动化，多个 id 用英文逗号分隔
  -h, --help             显示帮助

可用自动化 id：
  ${automations.map((automation) => automation.id).join("\n  ")}
`);
}
