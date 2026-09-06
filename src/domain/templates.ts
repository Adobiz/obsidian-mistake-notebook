/**
 * 笔记源码模板（纯函数）。
 *
 * 写入 vault 的笔记在这里一次性拼装：frontmatter + 题目 + 答案块。
 * 因为整篇源码在写入前就构造完成，长答案拆分的两条写入（题目+答案页）
 * 可以做到原子构造，不依赖"写入后再改写"这种易出错的流程。
 */

import type { AnswerMode, MistakeFrontmatter, MistakeStatus } from "./types";

/** 将任意字符串编码为可安全放进 YAML 双引号标量的形式（复用 JSON 转义）。 */
export function yamlStr(value: string): string {
  return JSON.stringify(value);
}

function yamlLines(fm: MistakeFrontmatter): string[] {
  const lines = ["---"];
  lines.push(`id: ${yamlStr(fm.id)}`);
  lines.push(`subject: ${yamlStr(fm.subject)}`);
  if (fm.source !== undefined) lines.push(`source: ${yamlStr(fm.source)}`);
  if (fm.errorType !== undefined) lines.push(`errorType: ${yamlStr(fm.errorType)}`);
  lines.push(`answerMode: ${yamlStr(fm.answerMode)}`);
  lines.push(`maskStyle: ${yamlStr(fm.maskStyle)}`);
  lines.push(`status: ${yamlStr(fm.status)}`);
  lines.push(`createdAt: ${yamlStr(fm.createdAt)}`);
  lines.push(`updatedAt: ${yamlStr(fm.updatedAt)}`);
  if (fm.tags !== undefined && fm.tags.length > 0) {
    lines.push("tags:");
    for (const tag of fm.tags) lines.push(`  - ${yamlStr(tag)}`);
  }
  lines.push("---");
  return lines;
}

export function frontmatterYaml(fm: MistakeFrontmatter): string {
  return yamlLines(fm).join("\n");
}

function buildMistakeFm(input: {
  id: string;
  subject: string;
  source?: string;
  errorType?: string;
  maskStyle: MistakeFrontmatter["maskStyle"];
  answerMode: AnswerMode;
  status: MistakeStatus;
  createdAt: string;
  tags?: string[];
}): MistakeFrontmatter {
  return { ...input, updatedAt: input.createdAt };
}

/**
 * 构造错题笔记全文。
 *
 * @param topic    题目要点/名称（将作为 H1 标题）
 * @param question 题干 Markdown
 * @param answerSection 已决定的答案区源码（内联 callout 或拆分占位 callout）
 */
export function buildQuestionSource(
  fm: MistakeFrontmatter,
  opts: { topic: string; question: string; answerSection: string },
): string {
  const parts = [
    ...yamlLines(fm),
    "",
    `# ${opts.topic}`,
    "",
    opts.question.trim() === "" ? "> [!todo] 题干待补充" : opts.question.trim(),
    "",
    opts.answerSection.trim(),
    "",
  ];
  return parts.join("\n");
}

export interface AnswerPageInput {
  /** 反链回题目的错题 ID。 */
  mtAnswerOf: string;
  /** 题目笔记文件名（不含扩展名）。 */
  questionFileBase: string;
  /** 答案内容（已去 callout 前缀的纯 Markdown）。 */
  answerContent: string;
}

/** 构造答案页全文：frontmatter 反链 + 顶部返回链接 + 答案内容。 */
export function buildAnswerPageSource(input: AnswerPageInput): string {
  const parts = [
    "---",
    `mt-answer-of: ${yamlStr(input.mtAnswerOf)}`,
    `questionName: ${yamlStr(input.questionFileBase)}`,
    "tags:",
    "  - 错题答案",
    "---",
    "",
    `> [!info] 答案页 · 返回题目`,
    `> [[${input.questionFileBase}|← 返回题目]]`,
    "",
    "## 完整答案",
    "",
    input.answerContent.trim(),
    "",
  ];
  return parts.join("\n");
}

/** 便捷构造：给定已生成/默认字段，返回标准 MistakeFrontmatter（M1 只落默认值）。 */
export function makeMistakeFrontmatter(input: {
  id: string;
  subject: string;
  source?: string;
  errorType?: string;
  maskStyle?: MistakeFrontmatter["maskStyle"];
  answerMode: AnswerMode;
  createdAt: string;
  tags?: string[];
}): MistakeFrontmatter {
  return buildMistakeFm({
    id: input.id,
    subject: input.subject,
    source: input.source,
    errorType: input.errorType,
    maskStyle: input.maskStyle ?? "auto",
    answerMode: input.answerMode,
    status: "pending",
    createdAt: input.createdAt,
    tags: input.tags ?? ["错题"],
  });
}
