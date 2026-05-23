# create-codex-info-automations

Install a small set of Codex automations that turn weekly tech sources into Chinese digests and write them into Obsidian.

Included automations:

- Hacker News weekly digest
- GitHub Trending weekly digest
- Hugging Face Trending Papers weekly digest
- HCI weekly paper digest
- V2EX weekly digest

## Usage

After publishing to npm:

```bash
npx create-codex-info-automations
```

Short alias:

```bash
npx codex-info-automations
```

Local development:

```bash
node bin/cli.js
```

Non-interactive install:

```bash
node bin/cli.js --yes --digest-path "$HOME/Obsidian/main/Digest" --workspace "$HOME/Project/Digest"
```

Preview without writing files:

```bash
node bin/cli.js --dry-run --yes
```

Install only selected automations:

```bash
node bin/cli.js --only hacker-news,v2ex
```

## What it writes

The installer writes files to:

```text
~/.codex/automations/<automation-id>/automation.toml
```

If an automation already exists, the installer can skip it or back up the old `automation.toml` before replacing it.

## After installing

Open the generated `automation.toml` files and adjust anything personal:

- Obsidian digest path
- Workspace directory
- Schedule
- Model
- Prompt wording
- Sources you want to keep or remove

The templates are intentionally plain TOML files so you can edit them directly.
