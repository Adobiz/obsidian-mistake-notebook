import { describe, expect, it } from "vitest";
import {
  buildAnswerPath,
  buildFileBase,
  buildQuestionPath,
  generateMistakeId,
  sanitizeNamePart,
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
  it("生成主题-学科-时间戳风格的文件名", () => {
    const base = buildFileBase("数学", "函数单调性", new Date(2025, 1, 12, 8, 5));
    expect(base).toBe("函数单调性-数学-20250212-0805");
  });

  it("学科含路径字符也不越界", () => {
    const base = buildFileBase("../物理", "斜面", new Date(2025, 1, 12, 8, 5));
    expect(buildQuestionPath("错题本", "../物理", base)).toBe(`错题本/物理/${base}.md`);
    expect(buildAnswerPath("答案", base)).toBe(`答案/${base}.md`);
  });
});
