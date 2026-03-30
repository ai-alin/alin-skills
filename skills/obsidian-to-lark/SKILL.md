---
name: obsidian-to-lark
description: 把 Obsidian Markdown 文件同步到飞书文档。当用户说"同步到飞书"、"发布到飞书"、"把这篇文章上传到飞书"、"sync to feishu/lark"、或者提到要把笔记/文章发布到飞书时触发。
argument-hint: [obsidian-file-path] [lark-doc-url-or-token]
allowed-tools: Bash, Read, Glob
---

# obsidian-to-lark

将 Obsidian Markdown 文件同步到飞书文档，自动处理图片上传、语法转换、frontmatter 写回。
底层调用 `~/.claude/skills/obsidian-to-lark/scripts/sync.js` 完成全部工作（**单次 Bash 调用**）。

## 参数

- `$ARGUMENTS[0]` — Obsidian 文件路径（相对或绝对均可；不填则询问用户）
- `$ARGUMENTS[1]` — 目标飞书文档 URL 或 token（可选；不填时脚本自动从 frontmatter 读取；都没有则新建）

## 使用步骤

### 1. 确认文件路径

如果用户只说了文件名，用 Glob 找到完整绝对路径。

### 2. 运行同步脚本（唯一的 Bash 调用）

```bash
node ~/.claude/skills/obsidian-to-lark/scripts/sync.js "/absolute/path/to/note.md"
```

覆盖已有文档（可选，脚本会自动从 frontmatter 的 `feishu_doc_url` 字段读取）：
```bash
node ~/.claude/skills/obsidian-to-lark/scripts/sync.js "/path/to/note.md" "https://www.feishu.cn/docx/xxx"
```

脚本自动处理：
- frontmatter 解析与剥离
- Obsidian 语法转换（wikilink、callout、highlight、注释）
- 本地图片查找与上传
- CDN 图片下载、上传、临时文件清理
- 创建新文档 or 覆盖已有文档（根据 frontmatter `feishu_doc_url` 自动判断）
- 完成后将 `feishu_doc_url` 和 `feishu_synced_at` 写回原文件 frontmatter

### 3. 告知用户结果

脚本 stdout 输出飞书文档链接，stderr 输出进度。将链接告知用户。

## 前置条件（用户首次使用）

```bash
npm install -g @larksuite/cli
lark-cli config init       # 填入 App ID 和 App Secret
lark-cli auth login --recommend
```

## Token 状态说明

- `valid` / `needs_refresh` → 正常，无需操作
- `expired` 或 401 → 需重新登录：`lark-cli auth login --recommend`

## 默认配置（在 sync.js 中修改）

- 新建文档目标文件夹：「已发布文章」（token: `JFbdfWFbpl36sRdNMThciW1cnBd`）
- frontmatter 写回：`feishu_doc_url`、`feishu_synced_at`（旧的 `feishu_doc_id` 字段自动删除）
- 大文本块自动分片（每片 ≤ 6000 字符）
- 图片失败时跳过并记录，不中断同步
