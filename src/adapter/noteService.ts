/**
 * 适配层：把领域层纯逻辑接到 Obsidian vault。
 *
 * 本文件是 "领域层 ←→ Obsidian" 的桥梁之一，职责：
 *  1. 目录确保与文件写入（创建错题、答案页、粘贴图片）；
 *  2. 阅读/改写现有笔记（拆分命令）；
 *  3. 导航（打开笔记）。
 * 任何文件写入前都已在领域层构造好完整源码 → 写入尽量原子。
 */

import { TFile } from "obsidian";
import type { App } from "obsidian";
import { findAnswerBlock, toCalloutLines } from "../domain/answerBlock";
import {
  buildAnswerPageSource,
  buildQuestionSource,
  makeMistakeFrontmatter,
} from "../domain/templates";
import {
  buildAnswerPath,
  buildFileBase,
  buildQuestionPath,
  generateMistakeId,
} from "../domain/naming";
import { parseMistakeFrontmatter } from "../domain/frontmatter";
import {
  buildPlaceholderBlock,
  replaceAnswerBlockWithPlaceholder,
  shouldSplit,
} from "../domain/splitRules";
import type { MistakeSettings } from "../settings";
import { toSplitRules } from "../settings";

export interface CreateMistakeParams {
  subject: string;
  topic: string;
  question: string;
  answer: string;
  source?: string;
  errorType?: string;
  /** 是否拆分为独立答案页（由 UI 依设置建议并让用户确认后传入）。 */
  splitToPage: boolean;
}

export interface CreateMistakeResult {
  questionPath: string;
  answerPath?: string;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

function isoNow(): string {
  return new Date().toISOString();
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class MistakeNoteService {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => MistakeSettings,
  ) {}

  /** 递归确保目录存在（Obsidian 不保证 createFolder 自动建父目录）。 */
  private async ensureFolder(path: string): Promise<void> {
    if (path === "" || path === "/") return;
    if (this.app.vault.getFolderByPath(path) !== null) return;
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent !== "") await this.ensureFolder(parent);
    try {
      await this.app.vault.createFolder(path);
    } catch (err) {
      // 并发/重复创建时静默（目录此刻已存在）
      if (this.app.vault.getFolderByPath(path) === null) throw err;
    }
  }

  /** 创建错题（必要时同时创建答案页）。 */
  async createMistake(params: CreateMistakeParams): Promise<CreateMistakeResult> {
    const settings = this.getSettings();
    const now = new Date();
    const id = generateMistakeId(now, params.subject);
    const fileBase = buildFileBase(params.subject, params.topic, now);
    const createdAt = isoNow();

    const fm = makeMistakeFrontmatter({
      id,
      subject: params.subject,
      source: params.source,
      errorType: params.errorType,
      maskStyle: "auto",
      answerMode: params.splitToPage ? "page" : "inline",
      createdAt,
      tags: ["错题"],
    });

    const answerSection = params.splitToPage
      ? buildPlaceholderBlock(fileBase)
      : `> [!answer] 答案\n${toCalloutLines(params.answer).join("\n")}`;

    const questionSource = buildQuestionSource(fm, {
      topic: params.topic,
      question: params.question,
      answerSection,
    });

    const questionPath = buildQuestionPath(settings.questionsRoot, params.subject, fileBase);
    const questionFolder = questionPath.slice(0, questionPath.lastIndexOf("/"));
    await this.ensureFolder(questionFolder);

    let answerPath: string | undefined;
    if (params.splitToPage) {
      const answerSource = buildAnswerPageSource({
        mtAnswerOf: id,
        questionFileBase: fileBase,
        answerContent: params.answer,
      });
      answerPath = buildAnswerPath(settings.answersRoot, fileBase);
      await this.ensureFolder(settings.answersRoot);
      await this.app.vault.create(answerPath, answerSource);
    }

    await this.app.vault.create(questionPath, questionSource);
    return { questionPath, answerPath };
  }

  /** 保存粘贴进录入框的图片，返回可嵌入的文件名（![[name]]）。 */
  async savePastedImage(data: ArrayBuffer, mimeType: string): Promise<string> {
    const settings = this.getSettings();
    const ext = MIME_EXT[mimeType] ?? "png";
    const folder = `${settings.questionsRoot}/.attachments`;
    await this.ensureFolder(folder);
    const name = `mt-img-${Date.now()}-${rand()}.${ext}`;
    await this.app.vault.createBinary(`${folder}/${name}`, data);
    return name;
  }

  /**
   * 把当前笔记内联答案拆成独立答案页。
   *
   * @param file  要操作的笔记
   * @param force 为 true 时无视"是否算长答案"，用户显式要求拆分
   */
  async splitCurrentNote(file: TFile, force = false): Promise<{ ok: boolean; message: string }> {
    const settings = this.getSettings();
    const source = await this.app.vault.read(file);
    const block = findAnswerBlock(source);

    if (!block.found) {
      return { ok: false, message: "当前笔记中没有 [!answer] 答案块。" };
    }
    if (block.isPlaceholderLinkOnly) {
      return { ok: false, message: "当前笔记的答案已经是拆分后的占位链接。" };
    }

    const cache = this.app.metadataCache.getFileCache(file);
    const fm = parseMistakeFrontmatter(cache?.frontmatter);
    const verdict = shouldSplit(block, fm.answerMode === "page", toSplitRules(settings));
    if (!force && !verdict.split) {
      return { ok: false, message: `答案不算长（${block.contentLength} 字），无需拆分。` };
    }

    const id = fm.id !== "" ? fm.id : generateMistakeId(new Date(), fm.subject);
    const answerBasename = file.basename;
    const answerSource = buildAnswerPageSource({
      mtAnswerOf: id,
      questionFileBase: answerBasename,
      answerContent: block.content,
    });
    const answerPath = buildAnswerPath(settings.answersRoot, answerBasename);
    await this.ensureFolder(settings.answersRoot);
    await this.app.vault.create(answerPath, answerSource);

    const replaced = replaceAnswerBlockWithPlaceholder(source, block, answerBasename);
    await this.app.vault.process(file, () => replaced);
    await this.app.fileManager.processFrontMatter(file, (data) => {
      data["answerMode"] = "page";
      if (data["id"] === undefined) data["id"] = id;
    });

    return { ok: true, message: `已拆分到 ${answerPath}。` };
  }

  /** 在活动标签页中打开指定路径的笔记。 */
  async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file === null || !(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
}
