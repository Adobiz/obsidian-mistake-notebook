import { describe, expect, it } from "vitest";
import {
  dictionariesComplete,
  detectObsidianLanguage,
  resolveLanguage,
  setCurrentLanguage,
  t,
} from "./i18n";

describe("resolveLanguage", () => {
  it("auto 跟随系统语言，显式选择优先", () => {
    expect(resolveLanguage("auto", "zh")).toBe("zh");
    expect(resolveLanguage("auto", "en")).toBe("en");
    expect(resolveLanguage("zh", "en")).toBe("zh");
    expect(resolveLanguage("en", "zh")).toBe("en");
  });
});

describe("detectObsidianLanguage", () => {
  it("node 环境下无 localStorage 时回退 en，不抛错", () => {
    expect(detectObsidianLanguage()).toBe("en");
  });
});

describe("t()", () => {
  it("占位符插值与语言切换", () => {
    setCurrentLanguage("zh");
    expect(t("cmd.newMistake")).toBe("新建错题（含答案遮罩）");
    expect(t("svc.answerExists", { path: "答案/x.md" })).toContain("答案/x.md");
    setCurrentLanguage("en");
    expect(t("cmd.newMistake")).toBe("New mistake (with answer mask)");
    expect(t("dash.heatTitle", { date: "2026-09-07", count: 3 })).toBe("2026-09-07: 3 added");
    setCurrentLanguage("zh");
  });

  it("缺失的英文翻译会暴露（字典完整性自检）", () => {
    expect(dictionariesComplete()).toBe(true);
  });
});
