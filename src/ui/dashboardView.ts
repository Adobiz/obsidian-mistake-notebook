/**
 * 错题仪表盘（左边栏 ItemView）：学科分类、数量、状态分布与
 * GitHub 风格的录入活跃热力格子。数据全部来自 metadataCache（零文件 IO），
 * 统计逻辑在领域层 stats.ts（纯函数，可单测）。文案走 i18n。
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
import { t, type MsgKey } from "../i18n";

export const DASHBOARD_VIEW_TYPE = "mt-dashboard";

const STATUS_KEYS = ["pending", "reviewing", "mastered", "archived"] as const;
const STATUS_T_KEY: Record<(typeof STATUS_KEYS)[number], MsgKey> = {
  pending: "dash.stPending",
  reviewing: "dash.stReviewing",
  mastered: "dash.stMastered",
  archived: "dash.stArchived",
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
    return t("dash.title");
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
      const stat = overview.createDiv({ cls: "mt-dash-stat" });
      stat.createDiv({ cls: "mt-dash-stat-value", text: String(value) });
      stat.createDiv({ cls: "mt-dash-stat-label", text: label });
    };
    mkStat(t("dash.total"), records.length);
    mkStat(t("dash.week"), thisWeek);
    mkStat(t("dash.splitPages"), splitCount);
    mkStat(t("dash.mastered"), statuses.get("mastered") ?? 0);

    // ---- 学科分布 ----
    root.createEl("h4", { text: t("dash.subjects"), cls: "mt-dash-heading" });
    if (subjects.length === 0) {
      root.createDiv({ cls: "mt-dash-empty", text: t("dash.empty") });
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
    root.createEl("h4", { text: t("dash.statuses"), cls: "mt-dash-heading" });
    const statusRow = root.createEl("div", { cls: "mt-dash-statuses" });
    for (const key of STATUS_KEYS) {
      statusRow.createSpan({
        cls: `mt-dash-status mt-dash-status-${key}`,
        text: `${t(STATUS_T_KEY[key])} ${statuses.get(key) ?? 0}`,
      });
    }

    // ---- 活跃热力格子（近 26 周，按录入时间） ----
    root.createEl("h4", { text: t("dash.heat"), cls: "mt-dash-heading" });
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
            title: cell.future
              ? ""
              : t("dash.heatTitle", { date: localDayKey(cell.date), count: cell.count }),
          },
        });
      }
    }
    const legend = root.createDiv({ cls: "mt-dash-heat-legend" });
    legend.appendText(`${t("dash.legendLess")} `);
    for (const lv of [0, 1, 2, 3, 4]) {
      legend.createDiv({ cls: `mt-dash-heat-cell mt-heat-${lv}` });
    }
    legend.appendText(` ${t("dash.legendMore")}`);
  }
}
