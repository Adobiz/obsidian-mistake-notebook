/**
 * "长答案 → 拆分答案页" 的判定与源码变换（纯函数，全部可单测）。
 *
 * 产品规则（见 docs/ADR-0001）：
 *  1. 内容超过阈值字符数 → 长答案；
 *  2. 含展示型公式块（$$…$$）→ 触发（默认开启）；
 *  3. 含图片默认**不**触发（照片答案应能原地遮罩揭晓），可配置；
 *  4. frontmatter 手动标记 answerMode: page → 强制拆分。
 *
 * 所有写回操作都在"构造新源码字符串"层面完成，绝不原地改用户文件，
 * 便于预览、可逆与测试。
 */

import { t } from "../i18n";
import type { AnswerBlock } from "./answerBlock";

export interface SplitRules {
  /** 触发拆分的答案字符阈值。 */
  thresholdChars: number;
  /** 含展示型公式块时触发。 */
  triggerDisplayMath: boolean;
  /** 含图片时触发（默认关：照片答案保留原地遮罩揭晓）。 */
  triggerImage: boolean;
}

export const DEFAULT_SPLIT_RULES: SplitRules = {
  thresholdChars: 400,
  triggerDisplayMath: true,
  triggerImage: false,
};

export interface SplitVerdict {
  split: boolean;
  reasons: string[];
}

/** 判断某答案块是否需要拆分为答案页。manualPage 来自 frontmatter 的 answerMode。 */
export function shouldSplit(
  block: AnswerBlock,
  manualPage: boolean,
  rules: SplitRules = DEFAULT_SPLIT_RULES,
): SplitVerdict {
  if (!block.found) return { split: false, reasons: [] };
  const reasons: string[] = [];
  if (manualPage) reasons.push("manual");
  if (block.contentLength > rules.thresholdChars) reasons.push("length");
  if (rules.triggerDisplayMath && block.hasDisplayMath) reasons.push("display-math");
  if (rules.triggerImage && block.hasImage) reasons.push("image");
  return { split: reasons.length > 0, reasons };
}

/**
 * 生成拆分后的占位答案块源码（原答案内容被替换成指向答案页的链接）。
 * 正文刻意只有单个 wikilink —— isPlaceholderLinkOnly 与阅读视图据此跳过遮罩，
 * 让链接可以直接点击跳转。
 *
 * @param answerBasename 答案页文件名（不含扩展名），占位链接指向它。
 */
export function buildPlaceholderBlock(answerBasename: string): string {
  const lines = [
    `> [!answer] ${t("a.placeholderHeading")}`,
    `> [[${answerBasename}|${t("a.viewFull")}]]`,
  ];
  return lines.join("\n");
}

/**
 * 把源码中 [lineStart, lineEnd] 的答案块替换为占位块。
 * 若 block.found 为 false 或区间非法，原样返回（绝不破坏笔记）。
 */
export function replaceAnswerBlockWithPlaceholder(
  source: string,
  block: AnswerBlock,
  answerBasename: string,
): string {
  if (!block.found || block.lineStart < 0 || block.lineEnd < block.lineStart) return source;
  const lines = source.split("\n");
  const replacement = buildPlaceholderBlock(answerBasename).split("\n");
  return [
    ...lines.slice(0, block.lineStart),
    ...replacement,
    ...lines.slice(block.lineEnd + 1),
  ].join("\n");
}
