import { describe, expect, it } from "vitest";
import { findAnswerBlock, stripCalloutPrefix, toCalloutLines } from "./answerBlock";

describe("findAnswerBlock", () => {
  it("找不到答案块时返回 found=false 的哨兵", () => {
    const src = "# 题目\n没有答案块的笔记。";
    const block = findAnswerBlock(src);
    expect(block.found).toBe(false);
    expect(block.lineStart).toBe(-1);
  });

  it("解析出简单的单行答案", () => {
    const src = ["## 题目", "> [!answer] 答案", "> 选 A", "", "后面还有内容"].join("\n");
    const block = findAnswerBlock(src);
    expect(block.found).toBe(true);
    expect(block.contentLines).toEqual(["选 A"]);
    expect(block.content).toBe("选 A");
    expect(block.contentLength).toBe(3);
    expect(block.lineStart).toBe(1);
    expect(block.lineEnd).toBe(2);
  });

  it("多行内容与空 '>' 行都被保留", () => {
    const src = ["> [!answer] 答案", "> 第一步：求导", ">", "> 第二步：画图", "", "收尾"].join(
      "\n",
    );
    const block = findAnswerBlock(src);
    expect(block.contentLines).toEqual(["第一步：求导", "", "第二步：画图"]);
    expect(block.contentLength).toBe("第一步：求导\n\n第二步：画图".length);
  });

  it("遇非 '>' 行结束块", () => {
    const src = ["> [!answer]", "> 内容", "正文没有引用前缀", "> 这行已不属于块"].join("\n");
    const block = findAnswerBlock(src);
    expect(block.found).toBe(true);
    expect(block.content).toBe("内容");
    expect(block.lineEnd).toBe(1);
  });

  it("识别展示型公式（多行 $$ 与单行 $$...$$）", () => {
    const multi = findAnswerBlock(["> [!answer]", "> $$", "> f(x)=x^2", "> $$"].join("\n"));
    expect(multi.hasDisplayMath).toBe(true);
    const single = findAnswerBlock(["> [!answer]", "> $$x+1=2$$"].join("\n"));
    expect(single.hasDisplayMath).toBe(true);
  });

  it("识别图片（embed 与 markdown 两种形态）", () => {
    const embed = findAnswerBlock(["> [!answer]", "> ![[解析图.png]]"].join("\n"));
    expect(embed.hasImage).toBe(true);
    const md = findAnswerBlock(["> [!answer]", "> ![图](attachments/a.png)"].join("\n"));
    expect(md.hasImage).toBe(true);
  });

  it("识别'纯 wikilink'占位形态（含带标题链接）", () => {
    const plain = findAnswerBlock(["> [!answer]", "> [[答案页A]]"].join("\n"));
    expect(plain.isPlaceholderLinkOnly).toBe(true);
    const titled = findAnswerBlock(["> [!answer]", "> [[答案页A|查看完整答案 →]]"].join("\n"));
    expect(titled.isPlaceholderLinkOnly).toBe(true);
    const withText = findAnswerBlock(["> [!answer]", "> 选 A 或 [[相关页]]"].join("\n"));
    expect(withText.isPlaceholderLinkOnly).toBe(false);
  });

  it("大小写不敏感匹配 [!answer]", () => {
    const block = findAnswerBlock(["> [!ANSWER]", "> 内容"].join("\n"));
    expect(block.found).toBe(true);
  });
});

describe("stripCalloutPrefix / toCalloutLines（互逆）", () => {
  it("去掉 '> ' 前缀", () => {
    expect(stripCalloutPrefix("> 内容")).toBe("内容");
    expect(stripCalloutPrefix(">")).toBe("");
    // 只去掉 '>' 与其后至多一个空格，其余空白保留（与 toCalloutLines 互逆）
    expect(stripCalloutPrefix("  >  内容")).toBe(" 内容");
    expect(stripCalloutPrefix(">内容（无空格写法）")).toBe("内容（无空格写法）");
  });

  it("把内容包回 callout 行，空行转 '>'", () => {
    expect(toCalloutLines("a\n\nb")).toEqual(["> a", ">", "> b"]);
  });
});
