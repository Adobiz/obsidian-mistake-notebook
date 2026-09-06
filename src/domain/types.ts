/**
 * 领域层公共类型。
 *
 * ⚠️ 领域层约定：本层任何文件都不得 import "obsidian" 或任何宿主 API，
 * 以保证所有核心逻辑可在 Node 环境（Vitest）中直接测试。
 * 与 Obsidian 打交道一律发生在 src/adapter/ 层。
 */

/** 遮罩风格。'auto' 表示按内容与学科默认规则推导（当前回退为默认风格）。 */
export type MaskStyle = "auto" | "blur" | "white" | "mosaic" | "frosted";

/** 答案存放模式：inline = 与题目同笔记；page = 拆分到独立答案页。 */
export type AnswerMode = "inline" | "page";

/** 复习状态机（M2 起使用，M1 先落库）。 */
export type MistakeStatus = "pending" | "reviewing" | "mastered" | "archived";

/** 错题笔记的 frontmatter 模型。字段全部可空读、可缺省（见 parseFrontmatter）。 */
export interface MistakeFrontmatter {
  /** 唯一错题 ID，形如 mt-20250212-xxxxxx。同时是答案页 mt-answer-of 的反链键。 */
  id: string;
  subject: string;
  /** 题目来源：考试名/练习册/日期等，可选。 */
  source?: string;
  /** 错误归因：概念不清/计算失误/审题错误/方法缺失 等，可选。 */
  errorType?: string;
  answerMode: AnswerMode;
  maskStyle: MaskStyle;
  status: MistakeStatus;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
}

/** 答案页（被拆分出去的笔记）的 frontmatter 模型。 */
export interface AnswerPageFrontmatter {
  /** 反链：所属题目的错题 ID，用于回溯与将来统计。 */
  mtAnswerOf: string;
  /** 人类可读的题目笔记名（用于 README/检索，非唯一键）。 */
  questionName: string;
  tags?: string[];
}
