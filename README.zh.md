# alin-skills

[A-Lin](https://github.com/alin-mr) 的 Claude Code Skill 合集，专注于内容发布工作流和知识管理。

[English](./README.md)

## 安装

安装单个 Skill：

```bash
npx skills add alin-mr/alin-skills --skill <skill-name>
```

安装全部 Skill：

```bash
npx skills add alin-mr/alin-skills
```

## Skill 列表

### obsidian-to-lark

将 Obsidian Markdown 文件同步到飞书文档，完整支持图片上传。

**触发词：** "同步到飞书"、"发布到飞书"、"sync to feishu"、"upload to lark"

**功能：**
- 自动上传本地图片和图床外链图片（腾讯云 COS、Cloudflare R2 等）
- 转换 Obsidian 特有语法（wikilink、callout、高亮、注释）
- 根据 frontmatter 自动判断新建或覆盖已有文档
- 同步完成后将 `feishu_doc_url` 和 `feishu_synced_at` 写回原文件
- 单次 Bash 调用完成全流程，无需多次手动确认

**前置条件：**
```bash
npm install -g @larksuite/cli
lark-cli config init       # 填入飞书 App ID 和 App Secret
lark-cli auth login --recommend
```

**使用方式：**
```
# 在 Claude Code 里直接说：
同步到飞书：笔记路径.md
```

[→ 查看完整文档](./skills/obsidian-to-lark/SKILL.md)

---

## License

MIT
