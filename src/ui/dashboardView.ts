/**
 * 错题仪表盘（左边栏 ItemView）：概览、学科/状态筛选、错题列表（点击跳转、状态快改）、
 * 热力格子（时间范围/数据源可切）与周新增柱状图。数据全部来自 metadataCache（零文件 IO）。
 * 统计逻辑在领域层 stats.ts（纯函数，可单测）；文案走 i18n。
 */

import { ItemView } from "obsidian";
import type { WorkspaceLeaf, TFile } from "obsidian";
import type MistakeNotebookPlugin from "../main";
import {
  buildHeatmap,
  countBySubject,
  filterRecords,
  heatLevel,
  lastActivityOf,
  localDayKey,
  sortByRecency,
  staleCount,
  weeklyAdded,
  type MistakeRecord,
} from "../domain/stats";
import { t, type MsgKey } from "../i18n";

export const DASHBOARD_VIEW_TYPE = "mt-dashboard";

/** 两态模型：待复习（pending）与已复习（非 pending，含旧四态数据）。 */
const DASH_STATUSES = ["pending", "done"] as const;
const STATUS_T_KEY: Record<(typeof DASH_STATUSES)[number], MsgKey> = {
  pending: "dash.stPending",
  done: "dash.stMastered",
};

/** 归一化：旧四态中的 reviewing/mastered/archived 都视为已复习。 */
function isReviewed(status: string): boolean {
  return status !== "pending" && status !== "";
}

interface DashboardRecord extends MistakeRecord {
  path: string;
}

export class MistakeDashboardView extends ItemView {
  private records: DashboardRecord[] = [];
  private filesByPath = new Map<string, TFile>();
  private filterSubject: string | null = null;
  /** 两态筛选："pending" 或 "done"；null=全部。 */
  private filterStatus: string | null = null;
  private heatWeeks: 26 | 52 = 26;
  private heatSource: "createdAt" | "updatedAt" = "createdAt";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: MistakeNotebookPlugin,
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

  /** 从 metadataCache 收集错题记录（frontmatter id 以 mt- 开头），并记录文件路径。 */
  private collectRecords(): void {
    this.records = [];
    this.filesByPath.clear();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const rawFm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (rawFm === undefined) continue;
      const fm: Record<string, unknown> = rawFm;
      const id = fm["id"];
      if (typeof id !== "string" || !id.startsWith("mt-")) continue;
      this.records.push({
        path: file.path,
        subject: typeof fm["subject"] === "string" ? fm["subject"] : "未分类",
        status: typeof fm["status"] === "string" ? fm["status"] : "pending",
        answerMode: typeof fm["answerMode"] === "string" ? fm["answerMode"] : "inline",
        createdAt: typeof fm["createdAt"] === "string" ? fm["createdAt"] : "",
        updatedAt: typeof fm["updatedAt"] === "string" ? fm["updatedAt"] : "",
      });
      this.filesByPath.set(file.path, file);
    }
  }

  /** 两态切换：待复习 ↔ 已复习（写 frontmatter 并同步 updatedAt）。 */
  private async cycleStatus(record: DashboardRecord): Promise<void> {
    const file = this.filesByPath.get(record.path);
    if (file === undefined) return;
    const next = isReviewed(record.status) ? "pending" : "mastered";
    await this.plugin.service.updateStatus(file, next);
    this.renderDashboard();
  }

  renderDashboard(): void {
    this.collectRecords();
    const root = this.contentEl;
    root.empty();
    root.addClass("mt-dashboard");

    const now = new Date();
    const all = this.records;
    const simplified = this.plugin.settings.simplifiedMode;
    const subjects = countBySubject(all);
    const splitCount = all.filter((r) => r.answerMode === "page").length;
    const stale = staleCount(all, now, 30);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const thisWeek = all.filter(
      (r) => r.createdAt !== "" && new Date(r.createdAt).getTime() >= weekStart.getTime(),
    ).length;

    // ---- 工具栏：手动刷新 + 热力范围/数据源切换 ----
    const toolbar = root.createEl("div", { cls: "mt-dash-toolbar" });
    const mkBtn = (cls: string, key: string, vars?: Record<string, string | number>): HTMLElement =>
      toolbar.createEl("button", { cls, text: t(key as MsgKey, vars) });
    mkBtn("mt-dash-btn mt-dash-btn-refresh", "dash.refresh").addEventListener("click", () =>
      this.renderDashboard(),
    );
    const rangeGroup = toolbar.createEl("div", { cls: "mt-dash-btn-group" });
    for (const [weeks, keyName] of [
      [26, "dash.range26"],
      [52, "dash.range52"],
    ] as Array<[26 | 52, MsgKey]>) {
      const btn = rangeGroup.createEl("button", {
        cls: `mt-dash-btn ${this.heatWeeks === weeks ? "is-active" : ""}`,
        text: t(keyName),
      });
      btn.addEventListener("click", () => {
        this.heatWeeks = weeks;
        this.renderDashboard();
      });
    }
    const sourceGroup = toolbar.createEl("div", { cls: "mt-dash-btn-group" });
    for (const [src, keyName] of [
      ["createdAt", "dash.byCreated"],
      ["updatedAt", "dash.byUpdated"],
    ] as Array<["createdAt" | "updatedAt", MsgKey]>) {
      const btn = sourceGroup.createEl("button", {
        cls: `mt-dash-btn ${this.heatSource === src ? "is-active" : ""}`,
        text: t(keyName),
      });
      btn.addEventListener("click", () => {
        this.heatSource = src;
        this.renderDashboard();
      });
    }

    // ---- 概览 ----
    const overview = root.createEl("div", { cls: "mt-dash-overview" });
    const mkStat = (label: string, value: string | number): void => {
      const stat = overview.createDiv({ cls: "mt-dash-stat" });
      stat.createDiv({ cls: "mt-dash-stat-value", text: String(value) });
      stat.createDiv({ cls: "mt-dash-stat-label", text: label });
    };
    mkStat(t("dash.total"), all.length);
    mkStat(t("dash.week"), thisWeek);
    mkStat(t("dash.splitPages"), splitCount);
    if (!simplified) {
      mkStat(t("dash.mastered"), all.length - all.filter((r) => !isReviewed(r.status)).length);
    }
    if (!simplified && stale > 0) {
      root.createDiv({ cls: "mt-dash-stale", text: t("dash.stale", { count: stale }) });
    }

    // ---- 学科分布（可点击筛选） ----
    root.createEl("h4", { text: t("dash.subjects"), cls: "mt-dash-heading" });
    if (subjects.length === 0) {
      root.createDiv({ cls: "mt-dash-empty", text: t("dash.empty") });
    } else {
      const max = subjects[0]?.count ?? 1;
      const list = root.createEl("div", { cls: "mt-dash-subjects" });
      for (const { subject, count } of subjects) {
        const active = this.filterSubject === subject;
        const row = list.createDiv({
          cls: `mt-dash-subject-row ${this.filterSubject === null ? "" : active ? "is-filtered" : "is-dimmed"}`,
        });
        row.createSpan({
          cls: "mt-dash-subject-name",
          text: active ? `✓ ${subject}` : subject,
        });
        const bar = row.createDiv({ cls: "mt-dash-subject-bar" });
        bar.createDiv({
          cls: "mt-dash-subject-bar-fill",
          attr: { style: `width: ${Math.round((count / max) * 100)}%` },
        });
        row.createSpan({ cls: "mt-dash-subject-count", text: String(count) });
        row.setAttr("role", "button");
        row.addEventListener("click", () => {
          this.filterSubject = active ? null : subject;
          this.renderDashboard();
        });
      }
    }

    // ---- 状态分布（可点击筛选；简化模式下隐藏） ----
    if (!simplified) {
      root.createEl("h4", { text: t("dash.statuses"), cls: "mt-dash-heading" });
      const statusRow = root.createEl("div", { cls: "mt-dash-statuses" });
      statusRow
        .createEl("span", {
          cls: "mt-dash-status chip-all is-clickable",
          text: `${t("dash.filterAll")} ${all.length}`,
        })
        .addEventListener("click", () => {
          this.filterStatus = null;
          this.renderDashboard();
        });
      const pendingCount = all.filter((r) => !isReviewed(r.status)).length;
      const doneCount = all.length - pendingCount;
      for (const key of DASH_STATUSES) {
        const count = key === "pending" ? pendingCount : doneCount;
        const chip = statusRow.createEl("span", {
          cls: `mt-dash-status mt-dash-status-${key === "pending" ? "pending" : "mastered"} is-clickable ${
            this.filterStatus === key ? "is-filtered" : ""
          }`,
          text: `${t(STATUS_T_KEY[key])} ${count}`,
        });
        chip.addEventListener("click", () => {
          this.filterStatus = this.filterStatus === key ? null : key;
          this.renderDashboard();
        });
      }
    }

    // ---- 活跃热力格子 ----
    root.createEl("h4", { text: t("dash.heat"), cls: "mt-dash-heading" });
    const grid = buildHeatmap(
      all.map((r) => r[this.heatSource]).filter((d) => d !== ""),
      this.heatWeeks,
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

    // ---- 近 8 周新增 ----
    root.createEl("h4", { text: t("dash.weeklyTrend"), cls: "mt-dash-heading" });
    const weekly = weeklyAdded(all, 8, now);
    const weeklyMax = Math.max(1, ...weekly);
    const chart = root.createEl("div", { cls: "mt-dash-bars" });
    for (const count of weekly) {
      const col = chart.createDiv({ cls: "mt-dash-bar-col" });
      col.createDiv({
        cls: "mt-dash-bar",
        attr: { style: `height: ${Math.round((count / weeklyMax) * 100)}%` },
      });
      col.createDiv({ cls: "mt-dash-bar-label", text: count === 0 ? "" : String(count) });
    }

    // ---- 错题列表（筛选 + 状态快改 + 点击跳转） ----
    root.createEl("h4", { text: t("dash.list"), cls: "mt-dash-heading" });
    root.createDiv({ cls: "mt-dash-hint", text: t("dash.sortHint") });
    const filtered = sortByRecency(
      filterRecords(all, {
        subject: this.filterSubject,
        status: simplified ? null : this.filterStatus,
      }),
    );
    if (filtered.length === 0) {
      const empty = root.createDiv({ cls: "mt-dash-empty", text: t("dash.listEmpty") });
      if (all.length === 0) {
        empty
          .createEl("button", { cls: "mod-cta mt-dash-new-btn", text: t("dash.openNew") })
          .addEventListener("click", () => this.plugin.openNewMistakeModal("create"));
      }
    } else {
      const listEl = root.createEl("div", { cls: "mt-dash-list" });
      for (const record of filtered) {
        const row = listEl.createDiv({ cls: "mt-dash-row" });
        row.createSpan({
          cls: "mt-dash-row-title",
          text: this.filesByPath.get(record.path)?.basename ?? record.path,
        });
        row.createSpan({ cls: "mt-dash-row-subject", text: record.subject });
        if (!simplified) {
          const statusBtn = row.createEl("button", {
            cls: `mt-dash-row-status mt-dash-status-${isReviewed(record.status) ? "mastered" : "pending"}`,
            text: t(isReviewed(record.status) ? "dash.stMastered" : "dash.stPending"),
          });
          statusBtn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            void this.cycleStatus(record);
          });
        }
        const last = lastActivityOf(record);
        row.createSpan({
          cls: "mt-dash-row-date",
          text: last === null ? "—" : localDayKey(last),
        });
        row.addEventListener("click", () => {
          void this.plugin.service.openNote(record.path);
        });
      }
    }
  }
}
