import { describe, expect, it } from "vitest";
import { findAnswerBlock } from "./answerBlock";
import {
  DEFAULT_SPLIT_RULES,
  buildPlaceholderBlock,
  replaceAnswerBlockWithPlaceholder,
  shouldSplit,
  type SplitRules,
} from "./splitRules";

function blockOf(source: string) {
  return findAnswerBlock(source);
}

describe("shouldSplit", () => {
  const longAnswer = Array.from({ length: 30 }, (_, i) => `这是第 ${i} 行很长的解析内容`).join(
    "\n",
  );

  it("空块不拆分", () => {
    const v = shouldSplit(blockOf("# 无答案"), false);
    expect(v.split).toBe(false);
  });

  it("短答案不拆分", () => {
    const v = shouldSplit(blockOf(["> [!answer]", "> 选 A"].join("\n")), false);
    expect(v.split).toBe(false);
    expect(v.reasons).toEqual([]);
  });

  it("超过字符阈值触发 length", () => {
    const src = ["> [!answer]", ...longAnswer.split("\n").map((l) => `> ${l}`)].join("\n");
    const v = shouldSplit(blockOf(src), false, { ...DEFAULT_SPLIT_RULES, thresholdChars: 100 });
    expect(v.split).toBe(true);
    expect(v.reasons).toContain("length");
  });

  it("含展示公式触发 display-math（默认开启）", () => {
    const src = ["> [!answer]", "> 过程：", "> $$", "> a^2+b^2=c^2", "> $$"].join("\n");
    const v = shouldSplit(blockOf(src), false);
    expect(v.split).toBe(true);
    expect(v.reasons).toContain("display-math");
  });

  it("含图片默认不触发，开启规则后才触发", () => {
    const src = ["> [!answer]", "> ![[解析图.png]]"].join("\n");
    expect(shouldSplit(blockOf(src), false).split).toBe(false);
    const rules: SplitRules = { ...DEFAULT_SPLIT_RULES, triggerImage: true };
    const v = shouldSplit(blockOf(src), false, rules);
    expect(v.split).toBe(true);
    expect(v.reasons).toContain("image");
  });

  it("manualPage 强制触发", () => {
    const src = ["> [!answer]", "> 短答案"].join("\n");
    const v = shouldSplit(blockOf(src), true);
    expect(v.split).toBe(true);
    expect(v.reasons).toContain("manual");
  });
});

describe("replaceAnswerBlockWithPlaceholder", () => {
  it("替换块并保留块外前后文", () => {
    const src = [
      "# 错题标题",
      "",
      "题干……",
      "",
      "> [!answer] 答案",
      "> 很长的解析",
      "> 第二行",
      "",
      "## 备注",
      "写给自己",
    ].join("\n");
    const block = findAnswerBlock(src);
    const out = replaceAnswerBlockWithPlaceholder(src, block, "答案页名");
    expect(out).toContain("## 备注");
    expect(out).toContain("# 错题标题");
    expect(out).toContain("> [[答案页名|查看完整答案 →]]");
    expect(out).not.toContain("很长的解析");
  });

  it("找不到块时原样返回", () => {
    const src = "# 只有题目";
    expect(replaceAnswerBlockWithPlaceholder(src, findAnswerBlock(src), "a")).toBe(src);
  });

  it("占位块只有 wikilink（可被 isPlaceholderLinkOnly 识别，免遮罩）", () => {
    const placeholder = buildPlaceholderBlock("答案页名");
    const block = findAnswerBlock(placeholder);
    expect(block.found).toBe(true);
    expect(block.isPlaceholderLinkOnly).toBe(true);
    expect(block.hasImage).toBe(false);
    expect(block.hasDisplayMath).toBe(false);
  });
});
