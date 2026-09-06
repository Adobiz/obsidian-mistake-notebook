import { describe, expect, it } from "vitest";
import { parseAnswerPageFrontmatter, parseMistakeFrontmatter } from "./frontmatter";

describe("parseMistakeFrontmatter", () => {
  it("正常对象原样通过", () => {
    const fm = parseMistakeFrontmatter({
      id: "mt-20250212-数-abc123",
      subject: "数学",
      answerMode: "page",
      maskStyle: "blur",
      status: "reviewing",
      createdAt: "2025-02-12T00:00:00Z",
    });
    expect(fm.id).toBe("mt-20250212-数-abc123");
    expect(fm.answerMode).toBe("page");
    expect(fm.source).toBeUndefined();
  });

  it("垃圾输入逐个回退默认值而不抛错", () => {
    const fm = parseMistakeFrontmatter(null);
    expect(fm.subject).toBe("未分类");
    expect(fm.answerMode).toBe("inline");
    expect(fm.maskStyle).toBe("auto");
    expect(fm.status).toBe("pending");
    expect(fm.createdAt).toBe("");

    const junk = parseMistakeFrontmatter({ subject: 123, answerMode: "nonsense", maskStyle: {} });
    expect(junk.subject).toBe("未分类");
    expect(junk.answerMode).toBe("inline");
  });

  it("tags 只保留字符串项", () => {
    const fm = parseMistakeFrontmatter({ tags: ["错题", 42, null, "函数"] });
    expect(fm.tags).toEqual(["错题", "函数"]);
  });
});

describe("parseAnswerPageFrontmatter", () => {
  it("读取反链字段并容错", () => {
    const fm = parseAnswerPageFrontmatter({
      "mt-answer-of": "mt-20250212-数-abc123",
      questionName: "函数单调性-数学-20250212-0805",
    });
    expect(fm.mtAnswerOf).toBe("mt-20250212-数-abc123");
    expect(parseAnswerPageFrontmatter({}).mtAnswerOf).toBe("");
  });
});
