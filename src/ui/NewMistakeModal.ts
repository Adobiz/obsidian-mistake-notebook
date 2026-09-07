/**
 * “新建错题”录入弹窗。
 *
 * 支持：文字/LaTeX 题干与答案录入；在答案框内直接 Ctrl/⌘+V 粘贴截图
 * （图片自动落盘到 vault，插入 ![[...]] 引用）。
 * “拆分答案页”复选框依据领域层判定默认给出建议，最终由用户确认。
 * 文案走 i18n；写入文件的默认值（未分类/错题）是数据约定，保持中文。
 */

import { Modal, Notice } from "obsidian";
import type { App, Editor, TFile } from "obsidian";
import { findAnswerBlock, toCalloutLines } from "../domain/answerBlock";
import { shouldSplit } from "../domain/splitRules";
import type { MistakeNoteService } from "../adapter/noteService";
import type { MistakeSettings } from "../settings";
import { toSplitRules } from "../settings";
import { t } from "../i18n";

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
    const suffix = this.getSettings().minimalMode ? t("modal.titleSuffix") : "";
    const base = this.mode === "insert" ? t("modal.insertTitle") : t("modal.newTitle");
    this.titleEl.setText(`${base}${suffix}`);
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
    const subject = minimal ? undefined : mkInput(t("modal.subjectLabel"), t("modal.subjectPh"));
    const source = minimal ? undefined : mkInput(t("modal.sourceLabel"), t("modal.sourcePh"));
    const errorType = minimal
      ? undefined
      : mkInput(t("modal.errorTypeLabel"), t("modal.errorTypePh"));
    const topic = minimal
      ? undefined
      : mkInput(
          this.mode === "insert" ? t("modal.topicLabelSplit") : t("modal.topicLabelFile"),
          t("modal.topicPh"),
        );
    if (minimal) {
      this.contentEl.createDiv({ cls: "mistake-minimal-note", text: t("modal.minimalNote") });
    }

    const qWrap = this.contentEl.createDiv({ cls: "mistake-field" });
    qWrap.createEl("label", { cls: "mistake-label", text: t("modal.questionLabel") });
    const question = qWrap.createEl("textarea");

    const aWrap = this.contentEl.createDiv({ cls: "mistake-field" });
    aWrap.createEl("label", { cls: "mistake-label", text: t("modal.answerLabel") });
    const answer = aWrap.createEl("textarea");

    const splitRow = this.contentEl.createDiv({ cls: "mistake-split-row" });
    const splitCheckbox = splitRow.createEl("input", { type: "checkbox" });
    const splitLabel = splitRow.createEl("label", { text: t("modal.splitCheck") });
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
      const chars = block.contentLength;
      if (s.splitBehavior === "auto") {
        // 设置为自动拆分：直接执行，不给复选框选择权
        splitCheckbox.checked = true;
        splitCheckbox.disabled = true;
        meta.setText(t("modal.metaAuto", { chars }));
      } else if (s.splitBehavior === "off") {
        splitCheckbox.checked = false;
        splitCheckbox.disabled = true;
        meta.setText(t("modal.metaOff", { chars }));
      } else {
        // ask：跟随建议，但用户点过复选框后尊重用户（避免替用户做决定）
        splitCheckbox.disabled = false;
        if (autoSuggest) splitCheckbox.checked = suggested;
        meta.setText(`${t("modal.metaAsk", { chars })}${suggested ? t("modal.suggestSplit") : ""}`);
        if (answer.value.trim() === "" && autoSuggest) splitCheckbox.checked = false;
      }
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
      text: this.mode === "insert" ? t("modal.btnInsert") : t("modal.btnCreate"),
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
        new Notice(
          t("modal.imgSaveFail", { err: err instanceof Error ? err.message : String(err) }),
        );
      }
    }
  }

  private validate(): string | null {
    const f = this.fields;
    if (f === undefined) return t("modal.errInit");
    if (f.subject !== undefined && f.subject.value.trim() === "") return t("modal.errSubject");
    if (f.answer.value.trim() === "" && f.question.value.trim() === "")
      return t("modal.errContent");
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
    const idleLabel = this.mode === "insert" ? t("modal.btnInsert") : t("modal.btnCreate");
    const busyLabel = this.mode === "insert" ? t("modal.busyInsert") : t("modal.busyCreate");
    const failLabel = this.mode === "insert" ? t("modal.failInsert") : t("modal.failCreate");
    f.error.setText("");
    this.writing = true;
    f.submit.setText(busyLabel);

    const answer = f.answer.value.trim();
    const question = f.question.value.trim();
    const text = (el?: HTMLInputElement): string => el?.value.trim() ?? "";
    // 数据约定：未填写的学科/主题走默认中文值（写入 frontmatter 与文件名，不随 UI 语言）
    const subject = text(f.subject) || "未分类";
    const topic = text(f.topic) || "错题";
    // 拆分决定：auto/off 直接按设置执行；ask 才看复选框（auto 下复选框是禁用态，
    // 不能用 checked && !disabled 判定，否则会被误判为不拆分）
    const behavior = this.getSettings().splitBehavior;
    const usePage =
      behavior === "auto" ? true : behavior === "off" ? false : f.splitCheckbox.checked;
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
          f.error.setText(t("modal.errNoCtx"));
          this.writing = false;
          f.submit.setText(idleLabel);
          return;
        }
        const inserted = await this.service.buildInsertBlock(params, this.hostFile);
        this.editor.replaceRange(`\n\n${inserted.block}`, this.editor.getCursor());
        this.close();
        new Notice(
          inserted.answerPath !== undefined
            ? t("modal.noticeInsertedPage", { path: inserted.answerPath })
            : t("modal.noticeInsertedInline"),
        );
        return;
      }

      const result = await this.service.createMistake(params);
      this.close();
      new Notice(t("modal.noticeCreated", { path: result.questionPath }));
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
