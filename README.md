# alin-skills

A collection of Claude Code skills by [A-Lin](https://github.com/RongShiMr), focused on content publishing workflows and knowledge management.

[中文文档](./README.zh.md)

## Install

```bash
npx skills add RongShiMr/alin-skills --skill <skill-name>
```

Or install all skills at once:

```bash
npx skills add RongShiMr/alin-skills
```

## Skills

### obsidian-to-lark

Sync Obsidian Markdown files to Feishu (Lark) documents with full image support.

**Triggers:** "同步到飞书", "发布到飞书", "sync to feishu", "upload to lark"

**Features:**
- Automatically uploads local images and CDN-hosted images
- Converts Obsidian-specific syntax (wikilinks, callouts, highlights)
- Creates new docs or overwrites existing ones based on frontmatter
- Writes back `feishu_doc_url` and `feishu_synced_at` to the original file
- Single Bash invocation — no repeated permission prompts

**Prerequisites:**
```bash
npm install -g @larksuite/cli
lark-cli config init       # Enter your Feishu App ID and App Secret
lark-cli auth login --recommend
```

**Usage:**
```
# In Claude Code, just say:
同步到飞书：path/to/note.md
sync to feishu: path/to/note.md
```

[→ Full documentation](./skills/obsidian-to-lark/SKILL.md)

---

## License

MIT
