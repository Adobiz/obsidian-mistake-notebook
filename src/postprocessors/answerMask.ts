/**
 * 阅读视图遮罩处理器（MarkdownPostProcessor）。
 *
 * 匹配 `> [!answer]` callout，并区分两种形态：
 *  1. 占位形态（内容仅一个指向答案页的 wikilink，如拆分后）→ 不加遮罩，原生链接可点；
 *  2. 真实答案 → 按 frontmatter maskStyle / 设置默认风格加 CSS 遮罩，
 *     点击整块揭晓，标题上的"重新遮住"可恢复。
 *
 * 已知取舍：CSS 遮罩是"防走神/防误看"级别的视觉隐藏，答案文本仍存在于 DOM
 * （见 docs/ADR-0003）。复习会话（M2）中会改成"DOM 里压根不放答案"的更强隔离。
 */

import { TFile } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { parseMistakeFrontmatter } from "../domain/frontmatter";
import type { MaskStyle } from "../domain/types";
import type { MistakeSettings } from "../settings";
import { t } from "../i18n";
import { listToDoneSet } from "../domain/review";

/** 当前已实现的遮罩风格（mosaic 依赖下方注入的 #mt-pixelate SVG 滤镜）。 */
const IMPLEMENTED_MASK_STYLES: readonly MaskStyle[] = ["blur", "white", "mosaic", "black"];

/**
 * mosaic 的像素化由 SVG 滤镜完成：feFlood 打一个 2x2 色点 → feComposite 裁进
 * 8x8 网格 → feTile 平铺成点阵 → 对源图形做 "in" 蒙版 → feMorphology 膨胀成色块，
 * 文字即被量化为 8px 像素块。滤镜定义由本插件注入 document.body 并幂等存在，
 * 保证 styles.css 里 filter: url(#mt-pixelate) 的引用不悬空（引用悬空会 fail-open）。
 */
function ensurePixelateFilterDef(): void {
  if (document.getElementById("mt-pixelate") !== null) return;
  const NS = "http://www.w3.org/2000/svg";
  // createEl 无法创建 SVG 命名空间元素，只能走 createElementNS
  const el = (tag: string): SVGElement => document.createElementNS(NS, tag);
  const svg = el("svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.id = "mt-pixelate-defs";
  const filter = el("filter");
  filter.id = "mt-pixelate";
  const dot = el("feFlood");
  dot.setAttribute("x", "4");
  dot.setAttribute("y", "4");
  dot.setAttribute("width", "2");
  dot.setAttribute("height", "2");
  const grid = el("feComposite");
  grid.setAttribute("width", "8");
  grid.setAttribute("height", "8");
  const tile = el("feTile");
  tile.setAttribute("result", "a");
  const masked = el("feComposite");
  masked.setAttribute("in", "SourceGraphic");
  masked.setAttribute("in2", "a");
  masked.setAttribute("operator", "in");
  const dilate = el("feMorphology");
  dilate.setAttribute("operator", "dilate");
  dilate.setAttribute("radius", "4");
  filter.append(dot, grid, tile, masked, dilate);
  svg.append(filter);
  document.body.appendChild(svg);
}

function resolveMaskStyle(fmStyle: MaskStyle, settings: MistakeSettings): MaskStyle {
  const style = fmStyle === "auto" ? settings.defaultMaskStyle : fmStyle;
  return (IMPLEMENTED_MASK_STYLES as readonly string[]).includes(style) ? style : "blur";
}

/** 判断 callout 是否为"仅含单个 wikilink"的占位形态。 */
function isPlaceholderCallout(callout: HTMLElement): boolean {
  const content = callout.querySelector<HTMLElement>(":scope > .callout-content");
  if (content === null) return false;
  const links = content.querySelectorAll("a.internal-link");
  if (links.length !== 1) return false;
  const link = links[0];
  if (link === undefined) return false;
  // 答案页/公式/图片/列表等"有实质内容"的块都不算占位
  if (content.querySelector("img, .math, math, pre, ul, ol, blockquote, table") !== null)
    return false;
  const hasExtraText =
    content.textContent !== null &&
    content.textContent.trim().length > (link.textContent ?? "").trim().length;
  return !hasExtraText;
}

/**
 * 页内错题总数 = [!answer] 答案块数量（含拆分占位形态）。
 * 不能数 mt-review 块——旧页面的块是后来才随模板生成的，数它会把多题页当成 1 题。
 */
function pageReviewCount(docRoot: HTMLElement | null): number {
  if (docRoot === null) return 1;
  return docRoot.querySelectorAll(".callout[data-callout='answer']").length || 1;
}

/** 复习块标记为已完成（视觉态：浅色 + 文案替换）。 */
function markReviewDone(block: HTMLElement): void {
  block.addClass("mt-review-done");
  const title = block.querySelector<HTMLElement>(":scope > .callout-title");
  title?.setText(t("review.alreadyDone"));
}

export interface AnswerMaskHooks {
  /** 揭晓答案时（用于"自动记录复习"）。非错题页不会触发（由调用方过滤）。 */
  /** total=本页错题块数（用于自动记录时整页判定）。 */
  onRevealed?: (file: TFile, total?: number) => void;
  /** 「完成复习」按钮点击时。 */
  /** index/total=页内第几道与总数（未传时由调用方自行选定，如回退条）。 */
  onComplete?: (file: TFile, index?: number, total?: number) => void;
}

export function createAnswerMaskPostProcessor(
  app: App,
  getSettings: () => MistakeSettings,
  hooks: AnswerMaskHooks = {},
) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    ensurePixelateFilterDef();
    const settings = getSettings();
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    const fm =
      file instanceof TFile
        ? parseMistakeFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter)
        : parseMistakeFrontmatter(undefined);

    // 视图根：阅读视图（reading/preview）与实时预览（source-view）都算；
    // 块序号/页块数必须在此范围内统计，否则 LP 下 el 只有单个块 → total=1 → 点谁都"全部完成"
    const docRoot = el.closest<HTMLElement>(
      ".markdown-reading-view, .markdown-preview-view, .markdown-source-view.is-live-preview, .workspace-leaf-content",
    );

    // 笔记内「完成复习」块（新建错题时自动生成）：点击推进状态；已复习显示完成态。
    const reviewBlocks = el.querySelectorAll<HTMLElement>(".callout[data-callout='mt-review']");
    for (const block of reviewBlocks) {
      if (block.dataset.mtReviewBound === "1") continue;
      block.dataset.mtReviewBound = "1";
      block.addClass("mt-review-callout");
      // 块级完成态：该块在 mt-review-list 中为 done（或整页 mastered）时显示"已复习"
      const doneIdx = Array.from(
        (docRoot ?? el).querySelectorAll<HTMLElement>(".callout[data-callout='mt-review']"),
      ).indexOf(block);
      const rawFm2 =
        file instanceof TFile ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
      // 完成集合：新字段 mt-review-done；兼容旧 mt-review-list 转换
      const doneSet = Array.isArray(rawFm2?.["mt-review-done"])
        ? new Set(rawFm2["mt-review-done"].filter((x): x is number => typeof x === "number"))
        : Array.isArray(rawFm2?.["mt-review-list"])
          ? new Set(
              listToDoneSet(
                rawFm2["mt-review-list"].filter((s): s is string => typeof s === "string"),
              ),
            )
          : new Set<number>();
      if (fm.status === "mastered" || doneSet.has(doneIdx)) markReviewDone(block);
      block.addEventListener("click", () => {
        markReviewDone(block);
        if (file instanceof TFile) {
          // 块级粒度：按文档顺序算出当前块下标与总数，页面内全部完成才算页完成
          const all = Array.from(
            (docRoot ?? el).querySelectorAll<HTMLElement>(".callout[data-callout='mt-review']"),
          );
          hooks.onComplete?.(file, all.indexOf(block), pageReviewCount(docRoot));
        }
      });
    }

    const callouts = Array.from(
      el.querySelectorAll<HTMLElement>(".callout[data-callout='answer']"),
    );
    for (const callout of callouts) {
      // 已被上层（嵌套答案块）处理，或本视图已处理过
      if (callout.closest(".mt-answer-callout, .mt-answer-placeholder") !== null) continue;
      if (callout.dataset.mtMasked === "1") continue;

      if (isPlaceholderCallout(callout)) {
        callout.classList.add("mt-answer-placeholder");
        callout.dataset.mtMasked = "1";
        continue;
      }

      const style = resolveMaskStyle(fm.maskStyle, settings);
      callout.classList.add("mt-answer-callout", `mt-mask-${style}`);
      callout.dataset.mtMasked = "1";

      const title = callout.querySelector<HTMLElement>(":scope > .callout-title");
      if (title === null) continue;

      const hint = title.createEl("span", { cls: "mt-mask-hint", text: t("mask.hint") });
      const remask = title.createEl("span", { cls: "mt-remask-btn", text: t("mask.remask") });

      hint.addEventListener("click", (ev) => {
        ev.stopPropagation();
        callout.classList.add("is-revealed");
        if (file instanceof TFile) hooks.onRevealed?.(file, pageReviewCount(docRoot));
      });
      remask.addEventListener("click", (ev) => {
        ev.stopPropagation();
        callout.classList.remove("is-revealed");
      });
      // 遮罩态下点击整块即揭晓；揭晓后不再因点击而收回（避免打断阅读链接）
      callout.addEventListener("click", (ev) => {
        if (ev.target instanceof Element && ev.target.closest(".mt-remask-btn, .mt-mask-hint")) {
          return; // 按钮自己处理，避免冒泡冲突
        }
        if (!callout.classList.contains("is-revealed")) {
          callout.classList.add("is-revealed");
          if (file instanceof TFile) hooks.onRevealed?.(file, pageReviewCount(docRoot));
        }
      });
    }
  };
}
