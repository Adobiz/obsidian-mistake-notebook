/**
 * 题目显示强调（toggle）：把选中文字包进 [!mt-question] 强调块，
 * 已包过的再执行则解除。纯编辑器文本变换——只碰题目视觉，不碰答案遮罩。
 */

import { Notice } from "obsidian";
import type { Editor } from "obsidian";
import { stripCalloutPrefix } from "../domain/answerBlock";
import { t } from "../i18n";

const HEADER_RE = /^[ \t]*>[ \t]*\[!mt-question\]/;

/** 从 startLine 起找完整 callout 块的结束行（连续 ">" 行，遇普通文本/空行结束）。 */
function calloutEndLine(editor: Editor, startLine: number): number {
  let end = startLine;
  for (let l = startLine + 1; l <= editor.lastLine(); l++) {
    const line = editor.getLine(l);
    if (!line.startsWith(">")) break;
    end = l;
  }
  return end;
}

export function toggleQuestionEmphasis(editor: Editor): void {
  const sel = editor.listSelections()[0];
  if (sel === undefined) return;
  const startLine = Math.min(sel.anchor.line, sel.head.line);
  const endLine = Math.max(sel.anchor.line, sel.head.line);
  const to = { line: endLine, ch: editor.getLine(endLine).length };

  // 已强调判定：首行即标题行，或标题行紧邻上一行且首行属于 callout 内容
  const firstLine = editor.getLine(startLine);
  const prevLine = startLine > 0 ? editor.getLine(startLine - 1) : "";
  const wrapped =
    HEADER_RE.test(firstLine) || (HEADER_RE.test(prevLine) && firstLine.startsWith(">"));

  if (wrapped) {
    const blockStart = HEADER_RE.test(firstLine) ? startLine : startLine - 1;
    const blockEnd = calloutEndLine(editor, blockStart);
    const content: string[] = [];
    for (let l = blockStart + 1; l <= blockEnd; l++) {
      content.push(stripCalloutPrefix(editor.getLine(l)));
    }
    editor.replaceRange(
      content.join("\n"),
      { line: blockStart, ch: 0 },
      { line: blockEnd, ch: editor.getLine(blockEnd).length },
    );
    return;
  }

  // 包裹前检查：拒绝包含 ">" 行（避免把答案 callout 嵌套进去），拒绝纯空白选区
  const lines: string[] = [];
  for (let l = startLine; l <= endLine; l++) lines.push(editor.getLine(l));
  if (lines.some((l) => l.startsWith(">"))) {
    new Notice(t("qe.hasCallout"));
    return;
  }
  if (lines.every((l) => l.trim() === "")) {
    new Notice(t("qe.empty"));
    return;
  }
  const wrappedText = [
    "> [!mt-question] 题目",
    ...lines.map((l) => (l.trim() === "" ? ">" : `> ${l}`)),
  ].join("\n");
  editor.replaceRange(wrappedText, { line: startLine, ch: 0 }, to);
}
