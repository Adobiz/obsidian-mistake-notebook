import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";

describe("normalizeSettings", () => {
  it("垃圾输入逐字段回退默认值", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ answersFollowQuestions: "yes" }).answersFollowQuestions).toBe(
      DEFAULT_SETTINGS.answersFollowQuestions,
    );
  });

  it("defaultMaskStyle 只接受已实现的风格，非法值回退默认", () => {
    expect(normalizeSettings({ defaultMaskStyle: "mosaic" }).defaultMaskStyle).toBe("mosaic");
    expect(normalizeSettings({ defaultMaskStyle: "black" }).defaultMaskStyle).toBe("black");
    expect(normalizeSettings({ defaultMaskStyle: "frosted" }).defaultMaskStyle).toBe(
      DEFAULT_SETTINGS.defaultMaskStyle,
    );
  });

  it("answersFollowQuestions / answersSubfolderWhenFollowing 只接受布尔值", () => {
    expect(normalizeSettings({ answersFollowQuestions: true }).answersFollowQuestions).toBe(true);
    expect(
      normalizeSettings({ answersSubfolderWhenFollowing: true }).answersSubfolderWhenFollowing,
    ).toBe(true);
    expect(
      normalizeSettings({ answersSubfolderWhenFollowing: "on" }).answersSubfolderWhenFollowing,
    ).toBe(DEFAULT_SETTINGS.answersSubfolderWhenFollowing);
  });

  it("minimalMode / autoQuestionEmphasis 只接受布尔值", () => {
    expect(normalizeSettings({ minimalMode: true }).minimalMode).toBe(true);
    expect(normalizeSettings({ minimalMode: 1 }).minimalMode).toBe(DEFAULT_SETTINGS.minimalMode);
    expect(normalizeSettings({ autoQuestionEmphasis: false }).autoQuestionEmphasis).toBe(false);
    expect(normalizeSettings({ autoQuestionEmphasis: "yes" }).autoQuestionEmphasis).toBe(
      DEFAULT_SETTINGS.autoQuestionEmphasis,
    );
  });

  it("hideMistakeProperties 只接受布尔值", () => {
    expect(normalizeSettings({ hideMistakeProperties: false }).hideMistakeProperties).toBe(false);
    expect(normalizeSettings({ hideMistakeProperties: "no" }).hideMistakeProperties).toBe(
      DEFAULT_SETTINGS.hideMistakeProperties,
    );
  });

  it("simplifiedMode 只接受布尔值（兼容旧键名 simplifiedDashboard）", () => {
    expect(normalizeSettings({ simplifiedMode: true }).simplifiedMode).toBe(true);
    expect(normalizeSettings({ simplifiedDashboard: true }).simplifiedMode).toBe(true);
    expect(normalizeSettings({ simplifiedMode: "x" }).simplifiedMode).toBe(
      DEFAULT_SETTINGS.simplifiedMode,
    );
  });

  it("language 只接受 auto/zh/en", () => {
    expect(normalizeSettings({ language: "en" }).language).toBe("en");
    expect(normalizeSettings({ language: "fr" }).language).toBe(DEFAULT_SETTINGS.language);
    expect(normalizeSettings({}).language).toBe("auto");
  });
});
