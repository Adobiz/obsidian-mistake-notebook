/**
 * 笔记源码模板（纯函数）。
 *
 * 写入 vault 的笔记在这里一次性拼装：frontmatter + 题目 + 答案块。
 * 因为整篇源码在写入前就构造完成，长答案拆分的两条写入（题目+答案页）
 * 可以做到原子构造，不依赖"写入后再改写"这种易出错的流程。
 */

import { toCalloutLines } from "./answerBlock";
import { buildPlaceholderBlock } from "./splitRules";
import { t } from "../i18n";
import type { AnswerMode, MistakeFrontmatter, MistakeStatus } from "./types";

/** 将任意字符串编码为可安全放进 YAML 双引号标量的形式（复用 JSON 转义）。 */
function yamlStr(value: string): string {
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
 * 把题目包进红色强调 callout（纯视觉强调：不参与遮罩/揭晓，也不被
 * findAnswerBlock 识别为答案块）。多行题目逐行转引用行，空行转 ">"。
 */
export function buildQuestionSection(question: string): string {
  return `> [!mt-question] ${t("q.emphasisTitle")}\n${toCalloutLines(question).join("\n")}`;
}

/**
 * 构造错题笔记全文。
 *
 * @param topic    题目要点/名称（将作为 H1 标题）
 * @param question 题干 Markdown
 * @param answerSection 已决定的答案区源码（内联 callout 或拆分占位 callout）
 * @param questionEmphasis 是否把题目包进红色强调块
 */
export function buildQuestionSource(
  fm: MistakeFrontmatter,
  opts: {
    topic: string;
    question: string;
    answerSection: string;
    questionEmphasis?: boolean;
  },
): string {
  const questionBlock =
    opts.question.trim() === ""
      ? `> [!todo] ${t("q.todoTitle")}`
      : opts.questionEmphasis
        ? buildQuestionSection(opts.question)
        : opts.question.trim();
  const parts = [
    ...yamlLines(fm),
    "",
    `# ${opts.topic}`,
    "",
    questionBlock,
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
    `> [!info] ${t("page.infoTitle")}`,
    `> [[${input.questionFileBase}|${t("page.backLink")}]]`,
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

/**
 * 按是否拆分构造答案区源码。
 * "新建错题笔记"与"插入当前笔记"两条录入入口共用，保证两种形态的答案块
 * 结构一致（遮罩/占位识别、后续反向合并都依赖这个形状）。
 */
export function buildAnswerSection(
  answer: string,
  splitToPage: boolean,
  answerBase: string,
): string {
  return splitToPage
    ? buildPlaceholderBlock(answerBase)
    : `> [!answer] ${t("a.title")}\n${toCalloutLines(answer).join("\n")}`;
}
