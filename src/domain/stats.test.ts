import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  countByStatus,
  countBySubject,
  heatLevel,
  localDayKey,
  type MistakeRecord,
} from "./stats";

function rec(partial: Partial<MistakeRecord>): MistakeRecord {
  return {
    subject: "数学",
    status: "pending",
    answerMode: "inline",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("countBySubject", () => {
  it("按学科聚合并按数量降序", () => {
    const out = countBySubject([
      rec({ subject: "数学" }),
      rec({ subject: "数学" }),
      rec({ subject: "物理" }),
      rec({ subject: "" }),
    ]);
    expect(out).toEqual([
      { subject: "数学", count: 2 },
      { subject: "物理", count: 1 },
      { subject: "未分类", count: 1 },
    ]);
  });
});

describe("countByStatus", () => {
  it("统计状态，空值归 pending", () => {
    const m = countByStatus([rec({}), rec({ status: "" }), rec({ status: "mastered" })]);
    expect(m.get("pending")).toBe(2);
    expect(m.get("mastered")).toBe(1);
  });
});

describe("localDayKey", () => {
  it("输出本地 YYYY-MM-DD，无效日期返回空串", () => {
    expect(localDayKey(new Date(2026, 8, 7))).toBe("2026-09-07");
    expect(localDayKey(new Date("not a date"))).toBe("");
  });
});

describe("buildHeatmap", () => {
  const today = new Date(2026, 8, 7); // 周一

  it("列数为 weeks，最后一列包含今天", () => {
    const grid = buildHeatmap([], 26, today);
    expect(grid.length).toBe(26);
    const lastCol = grid[grid.length - 1] ?? [];
    const todayCell = lastCol.find((c) => localDayKey(c.date) === "2026-09-07");
    expect(todayCell).toBeDefined();
    expect(todayCell?.future).toBe(false);
  });

  it("统计对应日期的条数，未来格子标记 future", () => {
    // 用本地时间构造（不依赖 CI/沙盒时区）：转成 ISO 后仍解析回同一本地日
    const local = (y: number, m: number, d: number) => new Date(y, m, d, 12).toISOString();
    const grid = buildHeatmap([local(2026, 8, 7), local(2026, 8, 7)], 4, today);
    const lastCol = grid[grid.length - 1] ?? [];
    const todayCell = lastCol.find((c) => localDayKey(c.date) === "2026-09-07");
    // 两条记录都落在本地 9-7 → 计数 2
    expect(todayCell?.count).toBe(2);
    const futureCells = lastCol.filter((c) => c.future);
    expect(futureCells.length).toBeGreaterThan(0);
  });

  it("无效日期被忽略不抛错", () => {
    expect(() => buildHeatmap(["junk", ""], 4, today)).not.toThrow();
  });
});

describe("heatLevel", () => {
  it("分档边界正确", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(3)).toBe(2);
    expect(heatLevel(6)).toBe(3);
    expect(heatLevel(10)).toBe(4);
  });
});
