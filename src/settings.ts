/**
 * 插件设置模型与持久化。
 * 注意：这里只有"形状与默认值"，真正与 Obsidian data.json 打交道在 main.ts。
 */

import type { MaskStyle } from "./domain/types";
import type { LanguagePref } from "./i18n";

export type SplitBehavior = "ask" | "auto" | "off";

/** 合法的默认遮罩风格（与 answerMask.ts 的实现清单保持一致）。 */
const DEFAULT_MASK_STYLES: readonly MaskStyle[] = ["auto", "blur", "white", "mosaic", "black"];

export interface MistakeSettings {
  /** 错题笔记根目录（相对 vault）。 */
  questionsRoot: string;
  /** 拆分答案页根目录（相对 vault）。 */
  answersRoot: string;
  /** 答案页是否跟随错题目录：开启时放错题笔记同目录，忽略 answersRoot。 */
  answersFollowQuestions: boolean;
  /** 仅跟随模式生效：在错题目录内再建 answersRoot 同名子文件夹收纳答案页。 */
  answersSubfolderWhenFollowing: boolean;
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
  /** 极简模式：录入只填题目与答案；界面隐藏属性面板等杂项。 */
  minimalMode: boolean;
  /** 新建/插入错题时自动把题目包进红色强调块（纯视觉，不参与遮罩）。 */
  autoQuestionEmphasis: boolean;
  /** 错题笔记与答案页隐藏顶部属性面板（仅显示层，数据仍完整写入）。 */
  hideMistakeProperties: boolean;
  /** 界面语言：auto=跟随 Obsidian；zh/en=手动指定。 */
  language: LanguagePref;
}

export const DEFAULT_SETTINGS: MistakeSettings = {
  questionsRoot: "错题本",
  answersRoot: "答案",
  answersFollowQuestions: false,
  answersSubfolderWhenFollowing: false,
  defaultMaskStyle: "blur",
  longAnswerThresholdChars: 400,
  triggerDisplayMath: true,
  triggerImage: false,
  splitBehavior: "ask",
  minimalMode: false,
  autoQuestionEmphasis: true,
  hideMistakeProperties: true,
  language: "auto",
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
    answersFollowQuestions:
      typeof o["answersFollowQuestions"] === "boolean"
        ? o["answersFollowQuestions"]
        : d.answersFollowQuestions,
    answersSubfolderWhenFollowing:
      typeof o["answersSubfolderWhenFollowing"] === "boolean"
        ? o["answersSubfolderWhenFollowing"]
        : d.answersSubfolderWhenFollowing,
    defaultMaskStyle:
      typeof o["defaultMaskStyle"] === "string" &&
      (DEFAULT_MASK_STYLES as readonly string[]).includes(o["defaultMaskStyle"])
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
    minimalMode: typeof o["minimalMode"] === "boolean" ? o["minimalMode"] : d.minimalMode,
    autoQuestionEmphasis:
      typeof o["autoQuestionEmphasis"] === "boolean"
        ? o["autoQuestionEmphasis"]
        : d.autoQuestionEmphasis,
    hideMistakeProperties:
      typeof o["hideMistakeProperties"] === "boolean"
        ? o["hideMistakeProperties"]
        : d.hideMistakeProperties,
    language: o["language"] === "zh" || o["language"] === "en" ? o["language"] : d.language,
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
