/**
 * 仪表盘统计（纯函数）：从错题 frontmatter 记录汇总学科/状态分布，
 * 并生成 GitHub 风格的活跃热力格子矩阵。渲染发生在 UI 层。
 */

/** 一条错题的可统计字段（由 UI 层从 metadataCache 提取并字符串化）。 */
export interface MistakeRecord {
  subject: string;
  status: string;
  answerMode: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectCount {
  subject: string;
  count: number;
}

/** 按学科聚合并按数量降序（同数量按名称稳定排序）。 */
export function countBySubject(records: MistakeRecord[]): SubjectCount[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const key = r.subject.trim() === "" ? "未分类" : r.subject;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        // 同数量时"未分类"沉底，其余按名称排序（中文即拼音序）
        (a.subject === "未分类"
          ? 1
          : b.subject === "未分类"
            ? -1
            : a.subject.localeCompare(b.subject)),
    );
}

/** 按状态计数，键为出现过的状态。 */
export function countByStatus(records: MistakeRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records) {
    const key = r.status.trim() === "" ? "pending" : r.status;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Date → 本地时区的 YYYY-MM-DD（热力图按用户本地日切分）。 */
export function localDayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface HeatCell {
  date: Date;
  count: number;
  /** 今天之后的格子：不渲染计数语义（置灰）。 */
  future: boolean;
}

/**
 * 活跃热力矩阵：weeks 列 × 7 行（周日为第一行），最后一列含 today。
 * dates 为错题的 ISO 时间数组；无效日期被忽略，绝不抛错。
 */
export function buildHeatmap(dates: string[], weeks: number, today: Date): HeatCell[][] {
  const counts = new Map<string, number>();
  for (const iso of dates) {
    const key = localDayKey(new Date(iso));
    if (key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekEnd = new Date(end);
  weekEnd.setDate(end.getDate() + (6 - end.getDay())); // 本周六，凑满最后一列

  const grid: HeatCell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col: HeatCell[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const d = new Date(weekEnd);
      d.setDate(weekEnd.getDate() - w * 7 - (6 - dow));
      const future = d.getTime() > end.getTime();
      col.push({ date: d, count: future ? 0 : (counts.get(localDayKey(d)) ?? 0), future });
    }
    grid.push(col);
  }
  return grid;
}

/** 热力格子颜色分档：0 → 0，1-2 → 1，3-5 → 2，6-9 → 3，≥10 → 4。 */
export function heatLevel(count: number): number {
  if (count >= 10) return 4;
  if (count >= 6) return 3;
  if (count >= 3) return 2;
  if (count >= 1) return 1;
  return 0;
}
