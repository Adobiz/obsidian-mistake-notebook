/**
 * 在笔记源码（Markdown 文本）中定位 `> [!answer]` callout 答案块。
 *
 * 为什么不用正则一把梭：答案块可能是多行、可能夹图片与公式，且解析失败时
 * 必须能向用户报告"没找到"而不是静默破坏笔记。这里按行扫描，返回行区间，
 * 供拆分（split）做精准的源码改写。
 *
 * 语法约定（与 Obsidian callout 渲染规则一致）：
 *   > [!answer] 标题（可选）
 *   > 答案内容……
 * 块在第一个非 ">" 前缀的空行/普通行处结束。
 */

export interface AnswerBlock {
  found: boolean;
  /** 答案块在整个源码中的起始行号（0 基，含标题行）。 */
  lineStart: number;
  /** 答案块结束行号（0 基，含最后一行内容；不含块后第一个空行）。 */
  lineEnd: number;
  /** 去掉了 "> " 前缀的内容行（保留内部换行与空 ">" 行）。 */
  contentLines: string[];
  /** contentLines 拼接成的纯文本，供统计/展示。 */
  content: string;
  /** 内容字符数（含换行）。 */
  contentLength: number;
  /** 是否含展示型公式块（$$ 独占行的多行公式，或单行 $$...$$）。 */
  hasDisplayMath: boolean;
  /** 是否含图片（![[...]] 或 ![](...)）。 */
  hasImage: boolean;
  /** 内容是否为"仅一个指向笔记的 wikilink"（拆分后的占位形态，不该被遮罩）。 */
  isPlaceholderLinkOnly: boolean;
}

/** 匹配 callout 标题行，例如 "> [!answer] 查看答案"。 */
const CALLOUT_HEADER_RE = /^[ \t]*>[ \t]*\[!answer\][ \t]*(.*)$/i;
/** 匹配 callout 内容行（以 > 开头的行）。 */
const CALLOUT_LINE_RE = /^[ \t]*>(?:[ \t]?(.*))?$/;
/** 图片：embed 链接或标准 markdown 图片。 */
const IMAGE_RE = /!\[\[[^\]|]+(?:\.[a-zA-Z0-9]+)?(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\([^)]*\)/;
/** 展示型公式行：整行仅 $$（多行公式边界），或一行内成对 $$。避免 "价格 $$100" 误判。 */
const DOLLAR_LINE_RE = /^[ \t]*\$\$[ \t]*$|^[ \t]*\$\$[^$]*\$\$[ \t]*$/;

/** 去掉一行的 ">" 前缀（可能带一个空格），返回净内容。 */
export function stripCalloutPrefix(line: string): string {
  const m = line.match(CALLOUT_LINE_RE);
  if (m === null) return line;
  return m[1] ?? "";
}

/** 把多行内容包成 callout 内容行（每行加 "> "，空行变 ">"）。 */
export function toCalloutLines(content: string): string[] {
  return content.split("\n").map((l) => (l.trim() === "" ? ">" : `> ${l}`));
}

/** 在源码中查找第一个 [!answer] 答案块。找不到时返回 found: false。 */
export function findAnswerBlock(source: string): AnswerBlock {
  const lines = source.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (CALLOUT_HEADER_RE.test(lines[i] ?? "")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      found: false,
      lineStart: -1,
      lineEnd: -1,
      contentLines: [],
      content: "",
      contentLength: 0,
      hasDisplayMath: false,
      hasImage: false,
      isPlaceholderLinkOnly: false,
    };
  }

  // 收集标题行之后的连续 ">" 行；空行（无 ">"）结束块。
  const contentLines: string[] = [];
  let cursor = headerIdx + 1;
  for (; cursor < lines.length; cursor++) {
    const line = lines[cursor] ?? "";
    if (!line.startsWith(">") && line.trim() !== "") break; // 普通文本行：块结束
    if (!CALLOUT_LINE_RE.test(line)) break; // 防御：不是合法 callout 行
    contentLines.push(stripCalloutPrefix(line));
  }
  // 块的最后一行到 cursor-1（若没有内容行，则块仅标题行，lineEnd=headerIdx）。
  const lastContent = contentLines.length > 0 ? cursor - 1 : headerIdx;

  const content = contentLines.join("\n");
  const hasDisplayMath = contentLines.some((l) => DOLLAR_LINE_RE.test(l));
  const hasImage = IMAGE_RE.test(content);
  const trimmed = content.trim();
  const isPlaceholderLinkOnly = /^\[\[[^\]]+\]\]$/.test(trimmed);

  return {
    found: true,
    lineStart: headerIdx,
    lineEnd: lastContent,
    contentLines,
    content,
    contentLength: content.length,
    hasDisplayMath,
    hasImage,
    isPlaceholderLinkOnly,
  };
}
