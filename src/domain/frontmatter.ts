/**
 * frontmatter 的读取/校验。
 *
 * 设计决策（见 docs/ADR-0002）：领域层不解析 YAML——YAML 序列化由 Obsidian 的
 * fileManager.processFrontMatter 负责，读取由 metadataCache 负责。领域层只做
 * 已解析对象的**运行时校验**（用户手改、同步冲突会产生非法值，不能直接信任）。
 */

import type { AnswerMode, MaskStyle, MistakeFrontmatter, MistakeStatus } from "./types";

const ANSWER_MODES: readonly AnswerMode[] = ["inline", "page"];
const MASK_STYLES: readonly MaskStyle[] = ["auto", "blur", "white", "mosaic", "black"];
const STATUSES: readonly MistakeStatus[] = ["pending", "reviewing", "mastered", "archived"];

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** 取字符串字段，非法/缺失时回退到 fallback，绝不抛错。 */
function strField(
  obj: Record<string, unknown>,
  key: string,
  fallback?: string,
): string | undefined {
  const v = obj[key];
  if (typeof v === "string" && v.trim() !== "") return v;
  return fallback;
}

/**
 * 将 metadataCache 读出的 frontmatter（unknown 对象）校验成 MistakeFrontmatter。
 * 非法字段逐个回退默认值，保证后续逻辑拿到的始终是合法形状。
 */
export function parseMistakeFrontmatter(raw: unknown): MistakeFrontmatter {
  const obj = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const tags = Array.isArray(obj["tags"])
    ? obj["tags"].filter((t): t is string => typeof t === "string")
    : undefined;
  return {
    id: strField(obj, "id", "") ?? "",
    subject: strField(obj, "subject", "未分类") ?? "未分类",
    source: strField(obj, "source"),
    errorType: strField(obj, "errorType"),
    answerMode: isOneOf(obj["answerMode"], ANSWER_MODES) ? obj["answerMode"] : "inline",
    maskStyle: isOneOf(obj["maskStyle"], MASK_STYLES) ? obj["maskStyle"] : "auto",
    status: isOneOf(obj["status"], STATUSES) ? obj["status"] : "pending",
    createdAt: strField(obj, "createdAt") ?? "",
    updatedAt: strField(obj, "updatedAt") ?? "",
    tags: tags !== undefined && tags.length > 0 ? tags : undefined,
  };
}
