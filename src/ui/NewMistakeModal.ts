/**
 * “新建错题”录入弹窗。
 *
 * 支持：文字/LaTeX 题干与答案录入；在答案框内直接 Ctrl/⌘+V 粘贴截图
 * （图片自动落盘到 vault，插入 ![[...]] 引用）。
 * “拆分答案页”复选框依据领域层判定默认给出建议，最终由用户确认。
 */

import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";
import { findAnswerBlock, toCalloutLines } from "../domain/answerBlock";
import { shouldSplit } from "../domain/splitRules";
import type { MistakeNoteService } from "../adapter/noteService";
import type { MistakeSettings } from "../settings";
import { toSplitRules } from "../settings";

interface FieldSet {
  subject: HTMLInputElement;
  source: HTMLInputElement;
  errorType: HTMLInputElement;
  topic: HTMLInputElement;
  question: HTMLTextAreaElement;
  answer: HTMLTextAreaElement;
  splitCheckbox: HTMLInputElement;
  meta: HTMLElement;
  error: HTMLElement;
  submit: HTMLButtonElement;
}

export class NewMistakeModal extends Modal {
  private readonly fields?: FieldSet;
  private writing = false;

  constructor(
    app: App,
    private readonly service: MistakeNoteService,
    private readonly getSettings: () => MistakeSettings,
  ) {
    super(app);
    this.titleEl.setText("新建错题");
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

    const subject = mkInput("学科（必填）", "数学 / 物理 / 英语…");
    const source = mkInput("来源（可选）", "月考 2025-01 / 练习册 P12…");
    const errorType = mkInput("错误类型（可选）", "概念混淆 / 计算失误 / 审题错误…");
    const topic = mkInput("题目要点（文件名用）", "如：函数单调性（可稍后改名）");

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
    const submit = footer.createEl("button", { text: "创建错题", cls: "mod-cta" });
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
        const name = await this.service.savePastedImage(data, file.type);
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
    if (f.subject.value.trim() === "") return "请填写学科。";
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
    f.error.setText("");
    this.writing = true;
    f.submit.setText("创建中…");

    const answer = f.answer.value.trim();
    const question = f.question.value.trim();
    const subject = f.subject.value.trim();
    const topic = f.topic.value.trim() || "错题";
    const usePage = f.splitCheckbox.checked && !f.splitCheckbox.disabled;

    try {
      const result = await this.service.createMistake({
        subject,
        topic,
        question,
        answer,
        source: f.source.value.trim() === "" ? undefined : f.source.value.trim(),
        errorType: f.errorType.value.trim() === "" ? undefined : f.errorType.value.trim(),
        splitToPage: usePage,
      });
      this.close();
      new Notice(`已创建错题：${result.questionPath}`);
      void this.service.openNote(result.questionPath);
    } catch (err) {
      f.error.setText(`创建失败：${err instanceof Error ? err.message : String(err)}`);
      this.writing = false;
      f.submit.setText("创建错题");
    }
  }

  /** 模态被关闭/取消时的兜底（避免写入进行中残留状态）。 */
  override onClose(): void {
    this.writing = false;
    super.onClose();
  }
}
