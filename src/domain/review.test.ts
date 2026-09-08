import { describe, expect, it } from "vitest";
import { applyDoneSet, nextReviewStatus } from "./review";

describe("nextReviewStatus（两态模型）", () => {
  it("待复习（pending/空值）→ 已复习", () => {
    expect(nextReviewStatus("pending")).toBe("mastered");
    expect(nextReviewStatus("")).toBe("mastered");
  });

  it("已复习（旧四态数据）不再推进", () => {
    expect(nextReviewStatus("mastered")).toBeNull();
    expect(nextReviewStatus("reviewing")).toBeNull();
    expect(nextReviewStatus("archived")).toBeNull();
    expect(nextReviewStatus("junk")).toBeNull();
  });
});

describe("applyDoneSet（完成集合模型）", () => {
  it("点第 2 块：集合加 1，页面未完成（total=3）", () => {
    const r = applyDoneSet([], 1, 3);
    expect(r.done).toEqual([1]);
    expect(r.pageDone).toBe(false);
  });

  it("重复点击同一块不重复计数", () => {
    const r1 = applyDoneSet([], 1, 3);
    const r2 = applyDoneSet(r1.done, 1, 3);
    expect(r2.done).toEqual([1]);
  });

  it("集合大小 ≥ total 才算页面完成；乱序点击也正确", () => {
    let s = applyDoneSet([], 2, 3); // 点第 3 块
    s = applyDoneSet(s.done, 0, 3); // 点第 1 块
    expect(s.done).toEqual([0, 2]);
    expect(s.pageDone).toBe(false);
    s = applyDoneSet(s.done, 1, 3); // 点第 2 块
    expect(s.pageDone).toBe(true);
  });

  it("越界序号被过滤，不影响计数", () => {
    const r = applyDoneSet([99, -1], 5, 3);
    expect(r.done).toEqual([]);
  });
});
