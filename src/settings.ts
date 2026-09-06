/**
 * 插件设置模型与持久化。
 * 注意：这里只有"形状与默认值"，真正与 Obsidian data.json 打交道在 main.ts。
 */

import type { MaskStyle } from "./domain/types";

export type SplitBehavior = "ask" | "auto" | "off";

export interface MistakeSettings {
  /** 错题笔记根目录（相对 vault）。 */
  questionsRoot: string;
  /** 拆分答案页根目录（相对 vault）。 */
  answersRoot: string;
  /** 遮罩默认风格（'auto' 在渲染时同样回退到它）。 */
  defaultMaskStyle: MaskStyle;
  /** 长答案字符阈值。 */
  longAnswerThresholdChars: number;
  /** 含展示型公式是否触发拆分。 */
  triggerDisplayMath: boolean;
  /** 含图片是否触发拆分。 */
  triggerImage: boolean;
  /** 新建错题时的默认拆分行为。 */
  splitBehavior: SplitBehavior;
}

export const DEFAULT_SETTINGS: MistakeSettings = {
  questionsRoot: "错题本",
  answersRoot: "答案",
  defaultMaskStyle: "blur",
  longAnswerThresholdChars: 400,
  triggerDisplayMath: true,
  triggerImage: false,
  splitBehavior: "ask",
};

/** 与磁盘上的旧/损坏配置合并，逐字段回退默认值（绝不抛错）。 */
export function normalizeSettings(raw: unknown): MistakeSettings {
  const d = DEFAULT_SETTINGS;
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    questionsRoot:
      typeof o["questionsRoot"] === "string" && o["questionsRoot"].trim() !== ""
        ? o["questionsRoot"]
        : d.questionsRoot,
    answersRoot:
      typeof o["answersRoot"] === "string" && o["answersRoot"].trim() !== ""
        ? o["answersRoot"]
        : d.answersRoot,
    defaultMaskStyle:
      typeof o["defaultMaskStyle"] === "string"
        ? (o["defaultMaskStyle"] as MaskStyle)
        : d.defaultMaskStyle,
    longAnswerThresholdChars:
      typeof o["longAnswerThresholdChars"] === "number" && o["longAnswerThresholdChars"] > 0
        ? o["longAnswerThresholdChars"]
        : d.longAnswerThresholdChars,
    triggerDisplayMath:
      typeof o["triggerDisplayMath"] === "boolean" ? o["triggerDisplayMath"] : d.triggerDisplayMath,
    triggerImage: typeof o["triggerImage"] === "boolean" ? o["triggerImage"] : d.triggerImage,
    splitBehavior:
      o["splitBehavior"] === "auto" || o["splitBehavior"] === "off" || o["splitBehavior"] === "ask"
        ? o["splitBehavior"]
        : d.splitBehavior,
  };
}

/** 从设置构造领域层拆分规则。 */
export function toSplitRules(s: MistakeSettings) {
  return {
    thresholdChars: s.longAnswerThresholdChars,
    triggerDisplayMath: s.triggerDisplayMath,
    triggerImage: s.triggerImage,
  };
}
