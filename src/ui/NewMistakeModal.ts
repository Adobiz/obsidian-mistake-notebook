/**
 * “新建错题”录入弹窗。
 *
 * 支持：文字/LaTeX 题干与答案录入；在答案框内直接 Ctrl/⌘+V 粘贴截图
 * （图片自动落盘到 vault，插入 ![[...]] 引用）。
 * “拆分答案页”复选框依据领域层判定默认给出建议，最终由用户确认。
 */

import { Modal, Notice } from "obsidian";
import type { App, Editor, TFile } from "obsidian";
import { findAnswerBlock, toCalloutLines } from "../domain/answerBlock";
import { shouldSplit } from "../domain/splitRules";
import type { MistakeNoteService } from "../adapter/noteService";
import type { MistakeSettings } from "../settings";
import { toSplitRules } from "../settings";

interface FieldSet {
  /** 极简模式下省略（undefined），提交时走默认值。 */
  subject?: HTMLInputElement;
  source?: HTMLInputElement;
  errorType?: HTMLInputElement;
  topic?: HTMLInputElement;
  question: HTMLTextAreaElement;
  answer: HTMLTextAreaElement;
  splitCheckbox: HTMLInputElement;
  meta: HTMLElement;
  error: HTMLElement;
  submit: HTMLButtonElement;
}

/** 录入模式：create=新建独立错题笔记；insert=写入当前笔记光标处（不新建笔记）。 */
export type NewMistakeMode = "create" | "insert";

export interface NewMistakeModalOptions {
  mode?: NewMistakeMode;
  /** insert 模式必传：宿主笔记与宿主编辑器。 */
  hostFile?: TFile;
  editor?: Editor;
}

export class NewMistakeModal extends Modal {
  private readonly fields?: FieldSet;
  private readonly mode: NewMistakeMode;
  private readonly hostFile?: TFile;
  private readonly editor?: Editor;
  private writing = false;

  constructor(
    app: App,
    private readonly service: MistakeNoteService,
    private readonly getSettings: () => MistakeSettings,
    options: NewMistakeModalOptions = {},
  ) {
    super(app);
    this.mode = options.mode ?? "create";
    this.hostFile = options.hostFile;
    this.editor = options.editor;
    const suffix = this.getSettings().minimalMode ? "（极简）" : "";
    this.titleEl.setText(this.mode === "insert" ? `插入错题${suffix}` : `新建错题${suffix}`);
    this.fields = this.buildForm();
    this.modalEl.classList.add("mistake-modal");
  }

  private buildForm(): FieldSet {
    const s = this.getSettings();

    const mkInput = (label: string, placeholder: string): HTMLInputElement => {
      const wrap = this.contentEl.createDiv({ cls: "mistake-field" });
      wrap.createEl("label", { cls: "mistake-label", text: label });
      const input = wrap.createEl("input", { type: "text", placeholder });
      return input;
    };

    // 极简模式：省略学科/来源/错误类型/题目要点，提交时走默认值（未分类/错题），
    // 之后都能在笔记 frontmatter 里补改。
    const minimal = s.minimalMode;
    const subject = minimal ? undefined : mkInput("学科（必填）", "数学 / 物理 / 英语…");
    const source = minimal ? undefined : mkInput("来源（可选）", "月考 2025-01 / 练习册 P12…");
    const errorType = minimal
      ? undefined
      : mkInput("错误类型（可选）", "概念混淆 / 计算失误 / 审题错误…");
    const topic = minimal
      ? undefined
      : mkInput(
          this.mode === "insert" ? "题目要点（拆分答案页命名用）" : "题目要点（文件名用）",
          "如：函数单调性（可稍后改名）",
        );
    if (minimal) {
      this.contentEl.createDiv({
        cls: "mistake-minimal-note",
        text: "极简模式：只填题目与答案，学科等信息自动记为未分类，稍后可在笔记里补",
      });
    }

    const qWrap = this.contentEl.createDiv({ cls: "mistake-field" });
    qWrap.createEl("label", { cls: "mistake-label", text: "题干（支持 Markdown / LaTeX）" });
    const question = qWrap.createEl("textarea");

    const aWrap = this.contentEl.createDiv({ cls: "mistake-field" });
    aWrap.createEl("label", {
      cls: "mistake-label",
      text: "答案与解析（支持 Markdown / LaTeX / 直接粘贴截图）",
    });
    const answer = aWrap.createEl("textarea");

    const splitRow = this.contentEl.createDiv({ cls: "mistake-split-row" });
    const splitCheckbox = splitRow.createEl("input", { type: "checkbox" });
    const splitLabel = splitRow.createEl("label", { text: "拆分为独立答案页（长答案自动跳转）" });
    splitLabel.prepend(splitCheckbox);
    const meta = this.contentEl.createDiv({ cls: "mistake-answer-meta" });
    const error = this.contentEl.createDiv({ cls: "mistake-error" });

    // 实时反馈：答案长度 + 是否建议拆分
    // 只有"还没被用户手动点过复选框"时才自动跟随建议，避免替用户做决定。
    let autoSuggest = true;
    splitCheckbox.addEventListener("change", () => {
      autoSuggest = false;
    });
    const refresh = (): void => {
      const src = `> [!answer]\n${toCalloutLines(answer.value).join("\n")}`;
      const block = findAnswerBlock(src);
      const verdict = shouldSplit(block, false, toSplitRules(s));
      const suggested = verdict.split;
      meta.setText(`答案 ${block.contentLength} 字${suggested ? " · 建议拆分" : ""}`);
      if (s.splitBehavior !== "off") {
        splitCheckbox.disabled = false;
        if (autoSuggest) splitCheckbox.checked = suggested;
      } else {
        splitCheckbox.checked = false;
        splitCheckbox.disabled = true;
      }
      if (answer.value.trim() === "" && autoSuggest) splitCheckbox.checked = false;
    };
    answer.addEventListener("input", refresh);
    refresh();

    // 粘贴图片：落盘并插入引用（图片与文字录入并重）
    answer.addEventListener("paste", (ev: ClipboardEvent) => {
      const items = ev.clipboardData?.files;
      if (items === undefined || items.length === 0) return;
      ev.preventDefault();
      void this.handleImagePaste(items, answer);
    });

    const footer = this.contentEl.createDiv({ cls: "modal-button-container" });
    const submit = footer.createEl("button", {
      text: this.mode === "insert" ? "插入到当前笔记" : "创建错题",
      cls: "mod-cta",
    });
    submit.addEventListener("click", () => void this.onSubmit());

    return {
      subject,
      source,
      errorType,
      topic,
      question,
      answer,
      splitCheckbox,
      meta,
      error,
      submit,
    };
  }

  private async handleImagePaste(files: FileList, answer: HTMLTextAreaElement): Promise<void> {
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    for (const file of images) {
      try {
        const data = await file.arrayBuffer();
        const name = await this.service.savePastedImage(data, file.type, this.hostFile?.path ?? "");
        const embed = `![[${name}]]`;
        const start = answer.selectionStart ?? answer.value.length;
        answer.setRangeText(embed, start, answer.selectionEnd ?? start, "end");
        answer.value += "\n";
        answer.dispatchEvent(new Event("input"));
      } catch (err) {
        new Notice(`图片保存失败：${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private validate(): string | null {
    const f = this.fields;
    if (f === undefined) return "表单未初始化";
    if (f.subject !== undefined && f.subject.value.trim() === "") return "请填写学科。";
    if (f.answer.value.trim() === "" && f.question.value.trim() === "")
      return "题干与答案至少填一项。";
    return null;
  }

  private async onSubmit(): Promise<void> {
    const f = this.fields;
    if (f === undefined || this.writing) return;
    const invalid = this.validate();
    if (invalid !== null) {
      f.error.setText(invalid);
      return;
    }
    const idleLabel = this.mode === "insert" ? "插入到当前笔记" : "创建错题";
    const busyLabel = this.mode === "insert" ? "插入中…" : "创建中…";
    const failLabel = this.mode === "insert" ? "插入失败" : "创建失败";
    f.error.setText("");
    this.writing = true;
    f.submit.setText(busyLabel);

    const answer = f.answer.value.trim();
    const question = f.question.value.trim();
    const text = (el?: HTMLInputElement): string => el?.value.trim() ?? "";
    const subject = text(f.subject) || "未分类";
    const topic = text(f.topic) || "错题";
    const usePage = f.splitCheckbox.checked && !f.splitCheckbox.disabled;
    const params = {
      subject,
      topic,
      question,
      answer,
      source: text(f.source) === "" ? undefined : text(f.source),
      errorType: text(f.errorType) === "" ? undefined : text(f.errorType),
      splitToPage: usePage,
    };

    try {
      if (this.mode === "insert") {
        if (this.editor === undefined || this.hostFile === undefined) {
          f.error.setText("缺少宿主笔记上下文，请从右键菜单或命令面板重新进入。");
          this.writing = false;
          f.submit.setText(idleLabel);
          return;
        }
        const inserted = await this.service.buildInsertBlock(params, this.hostFile);
        this.editor.replaceRange(`\n\n${inserted.block}`, this.editor.getCursor());
        this.close();
        new Notice(
          inserted.answerPath !== undefined
            ? `已插入错题，答案页：${inserted.answerPath}`
            : "已在当前笔记插入错题。",
        );
        return;
      }

      const result = await this.service.createMistake(params);
      this.close();
      new Notice(`已创建错题：${result.questionPath}`);
      void this.service.openNote(result.questionPath);
    } catch (err) {
      f.error.setText(`${failLabel}：${err instanceof Error ? err.message : String(err)}`);
      this.writing = false;
      f.submit.setText(idleLabel);
    }
  }

  /** 模态被关闭/取消时的兜底（避免写入进行中残留状态）。 */
  override onClose(): void {
    this.writing = false;
    super.onClose();
  }
}
