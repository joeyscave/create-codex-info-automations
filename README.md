# create-codex-info-automations

一键安装一组 Codex 自动化，把每周技术信息源整理成中文摘要，并写入 Obsidian。

包含的自动化：

- Hacker News 周报
- GitHub Trending 周报
- Hugging Face Trending Papers 周报
- HCI 论文周报
- V2EX 周报

## 使用方式

```bash
npx create-codex-info-automations
```

短别名：

```bash
npx codex-info-automations
```

本地开发：

```bash
node bin/cli.js
```

全自动安装：

```bash
node bin/cli.js --yes --digest-path "$HOME/Obsidian/Main/Digest" --workspace "$HOME/Projects/Digest"
```

只预览，不写入文件：

```bash
node bin/cli.js --dry-run --yes
```

只安装部分自动化：

```bash
node bin/cli.js --only hacker-news,v2ex
```

## 前两步会问什么

安装流程开始时会先询问两个路径。

第一个是 Obsidian Digest 输出目录。自动化生成的周报会写入这个文件夹，方便你在 Obsidian 里长期保存、搜索和回看。通用示例：

```text
~/Obsidian/Main/Digest
```

第二个是 Codex 自动化运行目录。Codex 会在这个目录里运行任务，适合放临时文件、脚本或抓取过程中产生的中间内容。通用示例：

```text
~/Projects/Digest
```

## 它会写入哪里

安装器会把配置写入：

```text
~/.codex/automations/<automation-id>/automation.toml
```

如果同名自动化已经存在，安装器会询问是否备份旧文件并替换。

## 安装后建议检查

生成的 `automation.toml` 都是普通文本文件，可以直接修改：

- Obsidian Digest 输出目录
- Codex 自动化运行目录
- 运行时间
- 使用的模型
- prompt 内容
- 想保留或删除的信息源
