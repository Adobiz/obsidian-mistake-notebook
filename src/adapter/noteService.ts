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
import { findAnswerBlock } from "../domain/answerBlock";
import {
  buildAnswerPageSource,
  buildAnswerSection,
  buildQuestionSection,
  buildQuestionSource,
  makeMistakeFrontmatter,
} from "../domain/templates";
import {
  buildAnswerBase,
  buildAnswerPath,
  buildFileBase,
  buildQuestionPath,
  generateMistakeId,
  resolveAnswerDir,
  uniquifyFileBase,
} from "../domain/naming";
import { parseMistakeFrontmatter } from "../domain/frontmatter";
import { replaceAnswerBlockWithPlaceholder, shouldSplit } from "../domain/splitRules";
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
    let fileBase = buildFileBase(params.subject, params.topic, now);
    const createdAt = isoNow();

    // 主干唯一化：同秒重复创建同主题错题时自动加 -2/-3（vault 存在性检查）
    fileBase = uniquifyFileBase(
      fileBase,
      (candidate) =>
        this.app.vault.getAbstractFileByPath(
          buildQuestionPath(settings.questionsRoot, params.subject, candidate),
        ) !== null,
    );

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

    const answerSection = buildAnswerSection(
      params.answer,
      params.splitToPage,
      buildAnswerBase(fileBase),
    );

    const questionSource = buildQuestionSource(fm, {
      topic: params.topic,
      question: params.question,
      answerSection,
      questionEmphasis: settings.autoQuestionEmphasis,
    });

    const questionPath = buildQuestionPath(settings.questionsRoot, params.subject, fileBase);
    const questionFolder = questionPath.slice(0, questionPath.lastIndexOf("/"));
    await this.ensureFolder(questionFolder);

    // 先写题目，再写答案页；答案页失败则回滚题目，绝不留指向空答案页的孤儿
    await this.app.vault.create(questionPath, questionSource);

    let answerPath: string | undefined;
    if (params.splitToPage) {
      const answerSource = buildAnswerPageSource({
        mtAnswerOf: id,
        questionFileBase: fileBase,
        answerContent: params.answer,
      });
      // 答案页位置：跟随错题目录（可含子文件夹）或独立答案目录（历史约定）
      const answerDir = resolveAnswerDir(
        settings.answersFollowQuestions,
        settings.answersRoot,
        questionFolder,
        settings.answersSubfolderWhenFollowing,
      );
      answerPath = buildAnswerPath(answerDir, fileBase);
      await this.ensureFolder(answerDir);
      try {
        await this.app.vault.create(answerPath, answerSource);
      } catch (err) {
        // 答案页写入失败时回滚题目笔记（走回收站，尊重用户的删除偏好）
        const question = this.app.vault.getAbstractFileByPath(questionPath);
        if (question !== null) await this.app.fileManager.trashFile(question);
        throw err;
      }
    }

    return { questionPath, answerPath };
  }

  /**
   * "在当前位置插入"：不新建笔记，把一道错题就地写进宿主笔记（任意目录）。
   * 宿主笔记的 frontmatter 一概不动；错题身份（mt-answer-of、返回链接的宿主名）
   * 记录在拆分出的答案页上。返回需写入编辑器的源码块（题干可空 → 只插答案块）。
   */
  async buildInsertBlock(
    params: CreateMistakeParams,
    hostFile: TFile,
  ): Promise<{ block: string; answerPath?: string }> {
    const settings = this.getSettings();
    const now = new Date();
    const id = generateMistakeId(now, params.subject);
    const fileBase = buildFileBase(params.subject, params.topic, now);

    let answerPath: string | undefined;
    if (params.splitToPage) {
      const answerDir = resolveAnswerDir(
        settings.answersFollowQuestions,
        settings.answersRoot,
        hostFile.parent?.path ?? "",
        settings.answersSubfolderWhenFollowing,
      );
      answerPath = buildAnswerPath(answerDir, fileBase);
      await this.ensureFolder(answerDir);
      await this.app.vault.create(
        answerPath,
        buildAnswerPageSource({
          mtAnswerOf: id,
          questionFileBase: hostFile.basename,
          answerContent: params.answer,
        }),
      );
    }

    const answerSection = buildAnswerSection(
      params.answer,
      params.splitToPage,
      buildAnswerBase(fileBase),
    );
    const question = params.question.trim();
    const questionPart =
      question === ""
        ? []
        : [settings.autoQuestionEmphasis ? buildQuestionSection(question) : question, ""];
    const block = [...questionPart, answerSection, ""].join("\n");
    return { block, answerPath };
  }

  /**
   * 保存粘贴进录入框的图片，返回可嵌入的文件名（![[name]]）。
   * 路径跟随用户在 Obsidian 里配置的附件目录——绝不能写点开头的隐藏目录，
   * 那类目录不进 vault 索引，嵌入链接会是死链。
   */
  async savePastedImage(data: ArrayBuffer, mimeType: string, sourcePath = ""): Promise<string> {
    const ext = MIME_EXT[mimeType] ?? "png";
    const name = `mt-img-${Date.now()}-${rand()}.${ext}`;
    const path = await this.app.fileManager.getAvailablePathForAttachment(name, sourcePath);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    await this.ensureFolder(dir);
    await this.app.vault.createBinary(path, data);
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
    const questionBase = file.basename;
    const answerSource = buildAnswerPageSource({
      mtAnswerOf: id,
      questionFileBase: questionBase,
      answerContent: block.content,
    });
    const questionDir = file.parent?.path ?? "";
    const answerDir = resolveAnswerDir(
      settings.answersFollowQuestions,
      settings.answersRoot,
      questionDir,
      settings.answersSubfolderWhenFollowing,
    );
    const answerPath = buildAnswerPath(answerDir, questionBase);
    // 已存在同名答案页时不覆盖——提示用户处理，避免静默丢失已有解析
    if (this.app.vault.getAbstractFileByPath(answerPath) !== null) {
      return {
        ok: false,
        message: `答案页已存在（${answerPath}）。如需重拆，请先删除或改名旧答案页。`,
      };
    }
    await this.ensureFolder(answerDir);
    await this.app.vault.create(answerPath, answerSource);

    const replaced = replaceAnswerBlockWithPlaceholder(
      source,
      block,
      buildAnswerBase(questionBase),
    );
    await this.app.vault.process(file, () => replaced);
    await this.app.fileManager.processFrontMatter(file, (data: Record<string, unknown>) => {
      data["answerMode"] = "page";
      data["updatedAt"] = new Date().toISOString();
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
