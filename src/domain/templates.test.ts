import { describe, expect, it } from "vitest";
import { findAnswerBlock, toCalloutLines } from "./answerBlock";
import { buildPlaceholderBlock } from "./splitRules";
import { buildAnswerPageSource, buildQuestionSource, makeMistakeFrontmatter } from "./templates";

const CREATED = "2025-02-12T00:00:00.000Z";

function baseFm(answerMode: "inline" | "page") {
  return makeMistakeFrontmatter({
    id: "mt-20250212-数-abc123",
    subject: "数学",
    source: "月考一",
    errorType: "概念混淆",
    answerMode,
    createdAt: CREATED,
  });
}

describe("buildQuestionSource", () => {
  it("inline：生成 frontmatter + 题目 + callout 答案块", () => {
    const answerSection = `> [!answer] 答案\n${toCalloutLines("选 A\n\n$$x^2$$").join("\n")}`;
    const src = buildQuestionSource(baseFm("inline"), {
      topic: "函数单调性",
      question: "f(x)=x^2 的单调区间？",
      answerSection,
    });
    expect(src).toContain('id: "mt-20250212-数-abc123"');
    expect(src).toContain('subject: "数学"');
    expect(src).toContain('answerMode: "inline"');
    expect(src).toContain("# 函数单调性");
    expect(src).toContain("> [!answer] 答案");
    expect(src).toContain("> 选 A");
    // 生成的整篇源码应能被 findAnswerBlock 再次解析（可回读保证）
    const block = findAnswerBlock(src);
    expect(block.found).toBe(true);
    expect(block.content).toContain("$$x^2$$");
  });

  it("page：答案区为指向答案页的占位（单一 wikilink，可识别、免遮罩）", () => {
    // 直接从领域层构造占位块，保证与 splitRules 单测断言同一份实现
    const placeholder = buildPlaceholderBlock("xxx-数学-20250212");
    const src = buildQuestionSource(baseFm("page"), {
      topic: "长题",
      question: "题干",
      answerSection: placeholder,
    });
    const block = findAnswerBlock(src);
    expect(block.found).toBe(true);
    expect(block.isPlaceholderLinkOnly).toBe(true);
  });
});

describe("buildAnswerPageSource", () => {
  it("包含反链 frontmatter 与返回题目链接", () => {
    const src = buildAnswerPageSource({
      mtAnswerOf: "mt-20250212-数-abc123",
      questionFileBase: "函数单调性-数学-20250212-0805",
      answerContent: "## 解析\n一步步来\n\n![[解析图.png]]",
    });
    expect(src).toContain('mt-answer-of: "mt-20250212-数-abc123"');
    expect(src).toContain("[[函数单调性-数学-20250212-0805|← 返回题目]]");
    expect(src).toContain("![[解析图.png]]");
  });

  it("空答案内容也生成可读文件（不崩溃）", () => {
    const src = buildAnswerPageSource({
      mtAnswerOf: "mt-x",
      questionFileBase: "q",
      answerContent: "",
    });
    expect(src.length).toBeGreaterThan(0);
  });
});

describe("makeMistakeFrontmatter", () => {
  it("默认补 status/updatedAt/tags", () => {
    const fm = makeMistakeFrontmatter({
      id: "mt-1",
      subject: "物理",
      answerMode: "inline",
      createdAt: CREATED,
    });
    expect(fm.status).toBe("pending");
    expect(fm.updatedAt).toBe(CREATED);
    expect(fm.tags).toEqual(["错题"]);
    expect(fm.maskStyle).toBe("auto");
  });
});
