import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  countByStatus,
  countBySubject,
  filterRecords,
  heatLevel,
  lastActivityOf,
  localDayKey,
  sortByRecency,
  staleCount,
  weeklyAdded,
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

describe("lastActivityOf / staleCount", () => {
  const today = new Date(2026, 8, 7);

  it("updatedAt 优先，缺失回退 createdAt，均无效为 null", () => {
    expect(
      localDayKey(lastActivityOf(rec({ updatedAt: "2026-09-01T00:00:00Z" })) ?? new Date(NaN)),
    ).toBe("2026-09-01");
    expect(
      lastActivityOf(rec({ updatedAt: "", createdAt: "2026-08-01T00:00:00Z" }))?.getMonth(),
    ).toBe(7);
    expect(lastActivityOf(rec({ updatedAt: "", createdAt: "" }))).toBeNull();
  });

  it("积灰 = 未掌握且最近活动早于阈值；已掌握/已归档不计", () => {
    const old = "2026-07-01T00:00:00Z"; // 距 9-7 超过 30 天
    const fresh = "2026-09-06T00:00:00Z";
    const records = [
      rec({ status: "pending", updatedAt: old }),
      rec({ status: "reviewing", updatedAt: "", createdAt: old }),
      rec({ status: "mastered", updatedAt: old }),
      rec({ status: "archived", updatedAt: old }),
      rec({ status: "pending", updatedAt: fresh }),
      rec({ status: "pending", updatedAt: "" }),
    ];
    expect(staleCount(records, today, 30)).toBe(2);
  });
});

describe("weeklyAdded", () => {
  const today = new Date(2026, 8, 7); // 周一

  it("按周聚合，最早周在前、本周在最后", () => {
    const mk = (y: number, m: number, d: number) =>
      rec({ createdAt: new Date(y, m, d, 12).toISOString() });
    const out = weeklyAdded(
      [mk(2026, 8, 7), mk(2026, 8, 6), mk(2026, 8, 7), mk(2026, 7, 10), mk(2026, 5, 1)],
      4,
      today,
    );
    // 周首为周日：本周(9/6-9/7)=3；7/10、6/1 超出 4 周窗口不计
    expect(out[out.length - 1]).toBe(3);
    expect(out.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("超出窗口的旧记录不计入", () => {
    const out = weeklyAdded([rec({ createdAt: "2026-01-01T00:00:00Z" })], 4, today);
    expect(out.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("filterRecords / sortByRecency", () => {
  const records = [
    rec({ subject: "数学", status: "pending", updatedAt: "2026-09-01T00:00:00Z" }),
    rec({ subject: "", status: "mastered", updatedAt: "2026-09-06T00:00:00Z" }),
    rec({ subject: "数学", status: "mastered", updatedAt: "" }),
  ];

  it("按学科筛选：空学科归入未分类", () => {
    expect(filterRecords(records, { subject: "未分类" }).length).toBe(1);
    expect(filterRecords(records, { subject: "数学" }).length).toBe(2);
  });

  it("按状态筛选", () => {
    expect(filterRecords(records, { status: "mastered" }).length).toBe(2);
  });

  it("按最近活动降序，无时间沉底", () => {
    const sorted = sortByRecency(records);
    expect(sorted[0]?.updatedAt).toBe("2026-09-06T00:00:00Z");
    expect(sorted[sorted.length - 1]?.updatedAt).toBe("");
  });

  it("两态筛选：done=非 pending 均算已复习", () => {
    const two = [
      rec({ status: "pending" }),
      rec({ status: "reviewing" }),
      rec({ status: "mastered" }),
    ];
    expect(filterRecords(two, { status: "done" }).length).toBe(2);
    expect(filterRecords(two, { status: "pending" }).length).toBe(1);
  });
});
