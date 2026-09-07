/**
 * 错题仪表盘（左边栏 ItemView）：学科分类、数量、状态分布与
 * GitHub 风格的录入活跃热力格子。数据全部来自 metadataCache（零文件 IO），
 * 统计逻辑在领域层 stats.ts（纯函数，可单测）。
 */

import { ItemView } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";
import {
  buildHeatmap,
  countByStatus,
  countBySubject,
  heatLevel,
  localDayKey,
  type MistakeRecord,
} from "../domain/stats";
import type { MistakeSettings } from "../settings";

export const DASHBOARD_VIEW_TYPE = "mt-dashboard";

const STATUS_LABELS: Record<string, string> = {
  pending: "待复习",
  reviewing: "复习中",
  mastered: "已掌握",
  archived: "已归档",
};

export class MistakeDashboardView extends ItemView {
  constructor(
    leaf: WorkspaceLeaf,
    private readonly getSettings: () => MistakeSettings,
  ) {
    super(leaf);
  }

  override getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  override getDisplayText(): string {
    return "错题仪表盘";
  }

  override getIcon(): string {
    return "bar-chart-3";
  }

  override async onOpen(): Promise<void> {
    // 索引变化时自动刷新（视图关闭后 registerEvent 自动解绑）
    this.registerEvent(this.app.metadataCache.on("resolved", () => this.renderDashboard()));
    this.renderDashboard();
  }

  /** 从 metadataCache 收集错题记录（frontmatter id 以 mt- 开头）。 */
  private collectRecords(): MistakeRecord[] {
    const records: MistakeRecord[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const rawFm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (rawFm === undefined) continue;
      const fm: Record<string, unknown> = rawFm;
      const id = fm["id"];
      if (typeof id !== "string" || !id.startsWith("mt-")) continue;
      records.push({
        subject: typeof fm["subject"] === "string" ? fm["subject"] : "未分类",
        status: typeof fm["status"] === "string" ? fm["status"] : "pending",
        answerMode: typeof fm["answerMode"] === "string" ? fm["answerMode"] : "inline",
        createdAt: typeof fm["createdAt"] === "string" ? fm["createdAt"] : "",
        updatedAt: typeof fm["updatedAt"] === "string" ? fm["updatedAt"] : "",
      });
    }
    return records;
  }

  renderDashboard(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("mt-dashboard");

    const records = this.collectRecords();
    const subjects = countBySubject(records);
    const statuses = countByStatus(records);
    const splitCount = records.filter((r) => r.answerMode === "page").length;

    // 本周新增（按 createdAt 的本地日 ≥ 本周一）
    const now = new Date();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const thisWeek = records.filter(
      (r) => r.createdAt !== "" && new Date(r.createdAt).getTime() >= weekStart.getTime(),
    ).length;

    // ---- 概览 ----
    const overview = root.createEl("div", { cls: "mt-dash-overview" });
    const mkStat = (label: string, value: string | number): void => {
      overview
        .createDiv({ cls: "mt-dash-stat" })
        .append(
          createEl("div", { cls: "mt-dash-stat-value", text: String(value) }),
          createEl("div", { cls: "mt-dash-stat-label", text: label }),
        );
    };
    mkStat("错题总数", records.length);
    mkStat("本周新增", thisWeek);
    mkStat("已拆答案页", splitCount);
    mkStat("已掌握", statuses.get("mastered") ?? 0);

    // ---- 学科分布 ----
    root.createEl("h4", { text: "学科分布", cls: "mt-dash-heading" });
    if (subjects.length === 0) {
      root.createDiv({ cls: "mt-dash-empty", text: "还没有错题——先录一道吧！" });
    } else {
      const max = subjects[0]?.count ?? 1;
      const list = root.createEl("div", { cls: "mt-dash-subjects" });
      for (const { subject, count } of subjects) {
        const row = list.createDiv({ cls: "mt-dash-subject-row" });
        row.createSpan({ cls: "mt-dash-subject-name", text: subject });
        const bar = row.createDiv({ cls: "mt-dash-subject-bar" });
        bar.createDiv({
          cls: "mt-dash-subject-bar-fill",
          attr: { style: `width: ${Math.round((count / max) * 100)}%` },
        });
        row.createSpan({ cls: "mt-dash-subject-count", text: String(count) });
      }
    }

    // ---- 状态分布 ----
    root.createEl("h4", { text: "复习状态", cls: "mt-dash-heading" });
    const statusRow = root.createEl("div", { cls: "mt-dash-statuses" });
    for (const key of ["pending", "reviewing", "mastered", "archived"] as const) {
      statusRow.createSpan({
        cls: `mt-dash-status mt-dash-status-${key}`,
        text: `${STATUS_LABELS[key] ?? key} ${statuses.get(key) ?? 0}`,
      });
    }

    // ---- 活跃热力格子（近 26 周，按录入时间） ----
    root.createEl("h4", { text: "近半年录入活跃", cls: "mt-dash-heading" });
    const grid = buildHeatmap(
      records.map((r) => r.createdAt),
      26,
      now,
    );
    const heat = root.createEl("div", { cls: "mt-dash-heat" });
    for (const col of grid) {
      const colEl = heat.createDiv({ cls: "mt-dash-heat-col" });
      for (const cell of col) {
        const level = cell.future ? -1 : heatLevel(cell.count);
        const cls = level < 0 ? "mt-heat-future" : `mt-heat-${level}`;
        colEl.createDiv({
          cls: `mt-dash-heat-cell ${cls}`,
          attr: {
            title: cell.future ? "" : `${localDayKey(cell.date)}：录入 ${cell.count} 道`,
          },
        });
      }
    }
    const legend = root.createDiv({ cls: "mt-dash-heat-legend" });
    legend.appendText("少 ");
    for (const lv of [0, 1, 2, 3, 4]) {
      legend.createDiv({ cls: `mt-dash-heat-cell mt-heat-${lv}` });
    }
    legend.appendText(" 多");
  }
}
