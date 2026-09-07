<div align="center">

# 📓 Mistake Notebook

**Turn mistakes into reviewable assets: mask the answer, think first.**

Answer masking · Click to reveal · Long-answer splitting · Insert at cursor · Minimal mode

[English](README.md) | [简体中文](README.zh.md)

[![Release](https://img.shields.io/github/v/release/Adobiz/obsidian-mistake-notebook?color=blue&label=version)](https://github.com/Adobiz/obsidian-mistake-notebook/releases/)
[![CI](https://img.shields.io/github/actions/workflow/status/Adobiz/obsidian-mistake-notebook/ci.yml?label=CI)](https://github.com/Adobiz/obsidian-mistake-notebook/actions)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![Obsidian](https://img.shields.io/badge/Obsidian-1.6.6%2B-bd93f9?logo=obsidian&logoColor=white)

</div>

---

A mistake notebook (错题本) for Obsidian, built for exam-driven studying: whenever you get a question wrong, capture it — then review with the answer masked until you can solve it yourself.

## ✨ Features

- 🎭 **Answer masking, four styles** — blur / white / mosaic / black. Answers stay masked during review; click the block to reveal, and use "re-mask" in the title bar to test yourself again.
- ✂️ **Automatic long-answer splitting** — answers over a threshold (400 chars by default, configurable) or containing display math are split into a dedicated answer page; the question keeps a single link to it, with a "back to question" link on the answer page.
- 📥 **Insert mistakes in place** — insert a mistake (question + answer block) at the cursor of any note, no new file required; keep knowledge summaries and their mistakes on the same page.
- 🟥 **Question emphasis frame** — questions are wrapped in a black-outlined callout that visually pairs with the answer block; select text and right-click to toggle it manually.
- 🧘 **Minimal mode** — one command hides properties, backlinks and other chrome; the capture form reduces to just question and answer.
- 🖼 **Paste screenshots** — ⌘V an image straight into the answer field; it is saved to your configured attachment folder and linked automatically.
- 📂 **No lock-in** — one mistake is one plain Markdown note + frontmatter: editable, scriptable, exportable.

## 🚀 Install

**Community plugins** (after review): Settings → Community plugins → Browse → search "**Mistake Notebook**" or 「错题本」.

**Manual**: download `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/Adobiz/obsidian-mistake-notebook/releases) into

```
<vault>/.obsidian/plugins/mistake-notebook/
```

then enable Mistake Notebook in Community plugins. Beta versions are also available via [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## 📖 Usage

### Commands

| Command                          | Description                                                    |
| -------------------------------- | -------------------------------------------------------------- |
| 新建错题（含答案遮罩）           | Open the capture modal and create a standalone mistake note    |
| 在当前位置插入错题（含答案遮罩） | Insert a mistake at the cursor of the current note             |
| 把当前笔记的内联答案拆分为答案页 | Split the inline answer of the active note into an answer page |
| 切换极简模式                     | Toggle minimal mode (less chrome, simpler capture)             |

Right-click inside the editor for quick access: **插入错题** (insert here / new mistake page) and **题目显示强调** (toggle emphasis on selected text).

### Capturing

The form supports Markdown and LaTeX. Paste a screenshot with ⌘V directly into the answer field — it is saved following your Obsidian attachment-folder settings and embedded automatically. Answer length is shown live; the split checkbox is pre-checked when a split is recommended.

### Settings

| Setting                             | Default | Description                                             |
| ----------------------------------- | ------- | ------------------------------------------------------- |
| Default mask style                  | Blur    | Used when a note doesn't set `maskStyle` in frontmatter |
| Long-answer threshold               | 400     | Answers longer than this are recommended for splitting  |
| Split on display math               | On      | `$$…$$` blocks count as long answers                    |
| Split on images                     | Off     | Photo answers stay inline for masked reveal             |
| Split behavior on capture           | Ask     | Pre-check the split checkbox in the modal               |
| Answer pages follow question folder | Off     | Create answer pages next to the question note           |
| └ Subfolder inside question folder  | Off     | Put answer pages in `question-folder/答案/`             |
| Hide properties on mistake notes    | On      | Hide the frontmatter panel on question/answer pages     |
| Minimal mode                        | Off     | Less chrome; capture form reduced to question + answer  |

## 📂 Data structure

One mistake = one Markdown note:

```markdown
---
id: "mt-20250212-数学-a1b2c3"
subject: "数学"
answerMode: "page" # inline=same page; page=split to answer page
maskStyle: "auto" # auto/blur/white/mosaic/black
status: "pending" # pending/reviewing/mastered/archived
---

# 函数单调性

> [!mt-question] 题目
> 题干……

> [!answer] 查看完整答案（答案较长，已拆分答案页）
> [[函数单调性-数学-20250212-080509-答案|查看完整答案 →]]
```

Answer pages carry an `mt-answer-of` backlink and a "back to question" link. Conventions are documented in [docs/ADR](docs/ADR-INDEX.md).

## 🛠 Development

```bash
npm install
npm run dev        # watch build → main.js (copy into your vault's plugin folder)
npm run verify     # typecheck → lint → prettier → vitest → build (must pass before merging)
npm run test:watch # unit tests in watch mode
```

Layering: `src/domain` is pure TypeScript with zero dependencies (no "obsidian" imports) and is unit-tested in Node; the Obsidian API only appears in the adapter and UI layers. Business rules (split thresholds, naming, dedup) live in `src/domain` with `*.test.ts` files. Releases are built by CI from the tag — never attach local artifacts by hand.

## 🗺 Roadmap

- [x] M1: capture (text/screenshots) + answer masking + click to reveal + long-answer splitting
- [x] M1.5: insert in place, question emphasis, minimal mode, hidden properties
- [ ] M2: review mode (self-test: remembered / forgot) + spaced repetition scheduling
- [ ] M3: per-subject default mask style, statistics dashboard

## 🤝 Contributing

Issues and PRs are welcome — please run `npm run verify` before submitting. Commit messages follow Conventional Commits.

## License

[MIT](LICENSE) © Adobiz
