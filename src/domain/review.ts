/**
 * 复习状态流转（纯函数）：两态模型——待复习（pending）/ 已复习（其余一律视为已复习）。
 * 兼容旧四态数据：reviewing / mastered / archived 都已是"已复习"，不再推进。
 */

import type { MistakeStatus } from "./types";

/** 完成一次复习：pending → mastered；已经是已复习状态则不再推进。 */
export function nextReviewStatus(status: string): MistakeStatus | null {
  if (status === "pending" || status === "") return "mastered";
  return null;
}

/**
 * 块级复习状态：页面内每道错题（[!mt-review] 块）独立记录，全部完成才算页完成。
 * list 长度不足 total 时按 pending 补足（新插入的题、旧笔记无数组均适用）。
 */
export function applyReviewState(
  list: string[],
  index: number,
  total: number,
): { list: string[]; pageDone: boolean } {
  // index 越界（DOM 统计误差等）时钳制到有效范围——绝不能因越界赋值扩长数组，
  // 否则 Array[3]="done" 会生成 [pending,pending,pending,"done"]，把未完成的题误判为全完成
  const safeIndex = Math.min(Math.max(index, 0), total - 1);
  const normalized = Array.from({ length: total }, (_, i) =>
    i < list.length ? (list[i] === "done" ? "done" : "pending") : "pending",
  );
  normalized[safeIndex] = "done";
  return { list: normalized, pageDone: normalized.every((s) => s === "done") };
}

/**
 * 完成集合模型（用户方案）：
 *  - 页面总题数 total = 页面答案块数（postprocessor 统计传入）
 *  - mt-review-done 记录已完成块的序号集合（去重）
 *  - 页面完成 ⇔ 集合大小 ≥ total
 */
export function applyDoneSet(
  done: number[],
  index: number,
  total: number,
): { done: number[]; pageDone: boolean } {
  const set = new Set(done.filter((i) => Number.isInteger(i) && i >= 0 && i < total));
  if (Number.isInteger(index) && index >= 0 && index < total) set.add(index);
  const sorted = [...set].sort((a, b) => a - b);
  return { done: sorted, pageDone: sorted.length >= total };
}

/** 旧 mt-review-list（定长状态数组）→ 已完成块序号集合（兼容历史数据）。 */
export function listToDoneSet(list: string[]): number[] {
  return list.map((s, i) => (s === "done" ? i : -1)).filter((i) => i >= 0);
}
