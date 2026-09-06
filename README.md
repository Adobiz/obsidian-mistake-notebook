# Mistake Notebook (错题本) — Obsidian 插件

带**答案遮罩**（模糊 / 纯白 / 马赛克 / 纯黑）、**点击揭晓**与**长答案自动拆分答案页**的错题本插件。

## 为什么用它 / 核心交互

```text
复习/回看一篇错题笔记时：
  [!answer] 答案块默认是模糊/纯白/马赛克/纯黑的 —— 想不起来就先自己想
  单击答案块 → 揭晓（可”重新遮住”再看一遍）
  答案很长 → 自动拆到独立答案页，点击占位链接跳转，读完后可返回题目
  题目 → 黑色描边强调块与蓝色答案块呼应（设置可关；选中文字右键可手动强调/取消）
  极简模式 → 界面只留内容；录入只填题目与答案，学科等自动记为未分类
```

错题数据就是普通 Markdown + frontmatter，不锁数据，随时可手改、可被其他插件/脚本处理。

## 架构总览

```text
┌──────────────────────────────────────────────────────────┐
│ UI 层  src/ui / src/settingsTab.ts      薄，无业务逻辑    │
├──────────────────────────────────────────────────────────┤
│ 适配层  src/adapter/noteService.ts      唯一读写 vault    │
│         src/postprocessors/answerMask.ts 阅读视图遮罩      │
├──────────────────────────────────────────────────────────┤
│ 领域层  src/domain/**                  纯 TS，零依赖       │
│         · answerBlock：定位 [!answer] 答案块（行级解析）    │
│         · splitRules：长答案判定与源码变换                 │
│         · templates/naming/frontmatter：生成与校验         │
└──────────────────────────────────────────────────────────┘
```

**依赖规则**：领域层不得 import "obsidian"（可在 Node 直接单测）；Obsidian API 只出现在适配/UI 层。
各层职责与关键取舍见 [docs/ADR](./docs/)。

## 快速开始（开发）

```bash
npm install
npm run dev          # watch 模式，产物 main.js（放到 vault 的 .obsidian/plugins/mistake-notebook/）
```

质量门禁（本地与 CI 一致）：

```bash
npm run verify       # typecheck → lint → prettier --check → vitest → build
npm run test:watch   # 单测热重载
```

## 在 Obsidian 中试用

1. 构建后把 `main.js`、`manifest.json`、`styles.css` 拷入
   `<你的库>/.obsidian/plugins/mistake-notebook/`；
2. 设置 → 第三方插件 → 开启 Mistake Notebook；
3. 命令面板 → **新建错题（含答案遮罩）**。

生成的数据结构（约定见 docs/ADR-0001）：

```markdown
---
id: mt-20250212-数学-a1b2c3
subject: 数学
answerMode: page # inline=同页；page=答案已拆到答案页
maskStyle: auto # auto/blur/white/mosaic/black
status: pending
createdAt: "2025-02-12T00:00:00.000Z"
updatedAt: "2025-02-12T00:00:00.000Z"
tags:
  - "错题"
---

# 函数单调性

题干……

> [!answer] 答案较长，已拆分到答案页：[[函数单调性-数学-20250212-1030-答案|查看完整答案 →]]
```

## 代码约定（给半年后接手的人）

- 新增命令/入口看 `src/main.ts`；数据读写看 `src/adapter/noteService.ts`；
- 业务规则（拆分阈值、命名、ID）一律进 `src/domain/` 并配 `*.test.ts`；
- 命名前缀 `.mt-`（CSS）与 `mt-`（frontmatter 字段、文件夹）避免与生态冲突；
- 提交信息遵循 Conventional Commits；合并前必须 `npm run verify` 全绿。

## 路线图

- [x] M1：录入（图片/文字）+ 模糊/纯白遮罩 + 点击揭晓 + 长答案自动拆分跳转
- [ ] M2：复习视图（遮题自测：记住了/又错了）+ 间隔重复调度
- [ ] M3：学科默认遮罩风格、统计仪表盘
- [ ] 社区商店发布（需 PR 审查）

## License

MIT
