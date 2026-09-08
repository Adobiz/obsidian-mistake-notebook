import { describe, expect, it } from "vitest";
import { findAnswerBlock, toCalloutLines } from "./answerBlock";
import { buildPlaceholderBlock } from "./splitRules";
import {
  buildAnswerPageSource,
  buildAnswerSection,
  buildQuestionSection,
  buildQuestionSource,
  makeMistakeFrontmatter,
} from "./templates";

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
    expect(src).toContain("> [!mt-review] 完成复习");
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

describe("buildAnswerSection", () => {
  it("短答案 → 内联 [!answer] callout（可再被 findAnswerBlock 解析）", () => {
    const section = buildAnswerSection("选 A", false, "x-数学-20250212-0805-答案");
    expect(section).toBe("> [!answer] 答案\n> 选 A");
    expect(findAnswerBlock(section).found).toBe(true);
  });

  it("长答案 → 占位链接块，链接指向传入的答案页名", () => {
    const section = buildAnswerSection("很长的答案", true, "x-数学-20250212-0805-答案");
    expect(section).toBe(buildPlaceholderBlock("x-数学-20250212-0805-答案"));
    expect(section).toContain("> [[x-数学-20250212-0805-答案|查看完整答案 →]]");
  });
});

describe("buildQuestionSection", () => {
  it("题目包进红色强调 callout，多行/空行都转成引用行", () => {
    const section = buildQuestionSection("第一行\n\n第二行");
    expect(section).toBe("> [!mt-question] 题目\n> 第一行\n>\n> 第二行");
  });

  it("强调块不影响答案块解析：整篇里 findAnswerBlock 仍定位 [!answer]", () => {
    const src = [buildQuestionSection("题目内容"), "", "> [!answer] 答案", "> 选 A"].join("\n");
    const block = findAnswerBlock(src);
    expect(block.found).toBe(true);
    expect(block.content).toBe("选 A");
  });

  it("buildQuestionSource 开启强调时题目进强调块，关闭保持普通文字", () => {
    const answerSection = "> [!answer] 答案\n> A";
    const withEm = buildQuestionSource(baseFm("inline"), {
      topic: "t",
      question: "题干",
      answerSection,
      questionEmphasis: true,
    });
    expect(withEm).toContain("> [!mt-question] 题目\n> 题干");
    const without = buildQuestionSource(baseFm("inline"), {
      topic: "t",
      question: "题干",
      answerSection,
    });
    expect(without).not.toContain("mt-question");
    expect(without).toContain("题干");
  });
});
