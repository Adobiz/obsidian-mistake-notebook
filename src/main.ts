/**
 * 插件入口：装配领域层/适配层/UI，注册命令与阅读视图遮罩。
 *
 * 分层原则：main.ts 只做"组装与生命周期"，不承载业务逻辑。
 */

import { Notice, Plugin } from "obsidian";
import { MistakeNoteService } from "./adapter/noteService";
import { createAnswerMaskPostProcessor } from "./postprocessors/answerMask";
import { MistakeSettingTab } from "./settingsTab";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";
import type { MistakeSettings } from "./settings";
import { NewMistakeModal } from "./ui/NewMistakeModal";

export default class MistakeNotebookPlugin extends Plugin {
  /** 覆盖基类 Plugin.settings（见 obsidian 1.13+ 类型），用具体类型收窄。 */
  override settings: MistakeSettings = DEFAULT_SETTINGS;
  private service!: MistakeNoteService;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.service = new MistakeNoteService(this.app, () => this.settings);

    // 阅读视图：遮住 [!answer] 答案块（模糊/纯白 + 点击揭晓）
    this.registerMarkdownPostProcessor(
      createAnswerMaskPostProcessor(this.app, () => this.settings),
    );

    this.addSettingTab(new MistakeSettingTab(this.app, this));

    this.addCommand({
      id: "create-mistake",
      name: "新建错题（含答案遮罩）",
      callback: () => {
        new NewMistakeModal(this.app, this.service, () => this.settings).open();
      },
    });

    this.addCommand({
      id: "split-current-note-answer",
      name: "把当前笔记的内联答案拆分为答案页",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file === null) return false;
        if (!checking) {
          void (async () => {
            const result = await this.service.splitCurrentNote(file);
            new Notice(result.message, result.ok ? 4000 : 6000);
          })();
        }
        return true;
      },
    });
  }

  override async onunload(): Promise<void> {
    // 阅读视图处理器由 Obsidian 在卸载时自动解绑；事件监听随 DOM 释放。
    // 这里保留钩子，后续里程碑（如定时提醒）在此清理。
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
