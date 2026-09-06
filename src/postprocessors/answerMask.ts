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

/** M1 已实现的遮罩风格；mosaic/frosted 留待后续里程碑。 */
const IMPLEMENTED_MASK_STYLES: readonly MaskStyle[] = ["blur", "white"];

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

export function createAnswerMaskPostProcessor(app: App, getSettings: () => MistakeSettings) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const settings = getSettings();
    const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
    const fm =
      file instanceof TFile
        ? parseMistakeFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter)
        : parseMistakeFrontmatter(undefined);

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

      const hint = document.createElement("span");
      hint.className = "mt-mask-hint";
      hint.textContent = "👆 点击显示答案";
      const remask = document.createElement("span");
      remask.className = "mt-remask-btn";
      remask.textContent = "重新遮住";

      hint.addEventListener("click", (ev) => {
        ev.stopPropagation();
        callout.classList.add("is-revealed");
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
        }
      });

      title.append(hint, remask);
    }
  };
}
