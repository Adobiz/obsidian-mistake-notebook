import { describe, expect, it } from "vitest";
import {
  buildAnswerBase,
  buildAnswerPath,
  buildFileBase,
  buildQuestionPath,
  generateMistakeId,
  resolveAnswerDir,
  sanitizeNamePart,
  uniquifyFileBase,
} from "./naming";

describe("sanitizeNamePart", () => {
  it("剥离路径分隔与危险字符", () => {
    expect(sanitizeNamePart("../秘密/文件.txt")).toBe("秘密文件.txt");
    expect(sanitizeNamePart('a"b:c*d?e<f>g|h')).toBe("abcdefgh");
  });

  it("限制长度", () => {
    expect(sanitizeNamePart("长".repeat(100)).length).toBe(40);
  });
});

describe("generateMistakeId", () => {
  it("格式为 mt-YYYYMMDD-subject-6位随机", () => {
    const id = generateMistakeId(new Date(2025, 1, 12, 10, 30), "数学");
    expect(id).toMatch(/^mt-20250212-数学-[0-9a-z]{6}$/);
  });

  it("同一毫秒生成两个 ID 也不相同（随机后缀）", () => {
    const now = new Date(2025, 1, 12);
    expect(generateMistakeId(now, "数学")).not.toBe(generateMistakeId(now, "数学"));
  });
});

describe("buildFileBase / 路径", () => {
  it("生成主题-学科-秒级时间戳风格的文件名", () => {
    const base = buildFileBase("数学", "函数单调性", new Date(2025, 1, 12, 8, 5, 9));
    expect(base).toBe("函数单调性-数学-20250212-080509");
  });

  it("学科含路径字符也不越界", () => {
    const base = buildFileBase("../物理", "斜面", new Date(2025, 1, 12, 8, 5));
    expect(buildQuestionPath("错题本", "../物理", base)).toBe(`错题本/物理/${base}.md`);
    expect(buildAnswerPath("答案", base)).toBe(`答案/${base}-答案.md`);
  });

  it("答案页与题目页文件名不同（同名会让裸 wikilink 解析回笔记自己）", () => {
    const base = buildFileBase("数学", "函数单调性", new Date(2025, 1, 12, 8, 5));
    expect(buildAnswerBase(base)).toBe(`${base}-答案`);
    expect(buildAnswerBase(base)).not.toBe(base);
    const questionBase = buildQuestionPath("错题本", "数学", base)
      .replace(/\.md$/, "")
      .split("/")
      .pop();
    const answerBase = buildAnswerPath("答案", base).replace(/\.md$/, "").split("/").pop();
    expect(answerBase).not.toBe(questionBase);
  });

  it("answerDir 为根目录（空串）时产出无前缀路径", () => {
    expect(buildAnswerPath("", "函数单调性-数学-20250212-0805")).toBe(
      "函数单调性-数学-20250212-0805-答案.md",
    );
  });
});

describe("uniquifyFileBase", () => {
  it("不存在时原样返回", () => {
    expect(uniquifyFileBase("错题-数学-20250212-080509", () => false)).toBe(
      "错题-数学-20250212-080509",
    );
  });

  it("已存在时追加 -2/-3 直到唯一", () => {
    const taken = new Set([
      "a-数学-20250212-080509",
      "a-数学-20250212-080509-2",
      "a-数学-20250212-080509-3",
    ]);
    expect(uniquifyFileBase("a-数学-20250212-080509", (c) => taken.has(c))).toBe(
      "a-数学-20250212-080509-4",
    );
  });
});

describe("resolveAnswerDir", () => {
  it("关闭时用独立答案目录，开启时跟随错题所在目录", () => {
    expect(resolveAnswerDir(false, "答案", "错题本/数学")).toBe("答案");
    expect(resolveAnswerDir(true, "答案", "错题本/数学")).toBe("错题本/数学");
  });

  it("子开关开启时在错题目录内再建答案子文件夹", () => {
    expect(resolveAnswerDir(true, "答案", "错题本/数学", true)).toBe("错题本/数学/答案");
    // 子开关仅在跟随模式下有意义：关闭跟随时被忽略
    expect(resolveAnswerDir(false, "答案", "错题本/数学", true)).toBe("答案");
  });

  it("错题在 vault 根目录时归一为空串，尾斜杠也被剥掉", () => {
    expect(resolveAnswerDir(true, "答案", "/")).toBe("");
    expect(resolveAnswerDir(true, "答案", "")).toBe("");
    expect(resolveAnswerDir(false, "答案/", "错题本/数学")).toBe("答案");
    // 根目录 + 子开关：退化为 vault 根下的独立答案文件夹
    expect(resolveAnswerDir(true, "答案", "", true)).toBe("答案");
  });
});
