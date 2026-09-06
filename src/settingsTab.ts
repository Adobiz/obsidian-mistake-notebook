/**
 * 设置面板（PluginSettingTab）。
 */

import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type MistakeNotebookPlugin from "./main";
import type { MaskStyle } from "./domain/types";

const MASK_STYLE_OPTIONS: Array<[MaskStyle, string]> = [
  ["blur", "模糊（Blur）"],
  ["white", "纯白（White）"],
  ["mosaic", "马赛克（Mosaic，即将支持）"],
  ["frosted", "雾面玻璃（Frosted，即将支持）"],
];

export class MistakeSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MistakeNotebookPlugin,
  ) {
    super(app, plugin);
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "错题本 · 设置" });

    new Setting(containerEl)
      .setName("错题笔记根目录")
      .setDesc("新错题将存入 根目录/学科/ 下")
      .addText((t) =>
        t.setValue(this.plugin.settings.questionsRoot).onChange(async (v) => {
          this.plugin.settings.questionsRoot = v.trim() || "错题本";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("答案页根目录")
      .setDesc("拆分出的长答案存放目录")
      .addText((t) =>
        t.setValue(this.plugin.settings.answersRoot).onChange(async (v) => {
          this.plugin.settings.answersRoot = v.trim() || "答案";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("默认遮罩风格")
      .setDesc("答案块未单独指定风格时使用；单题可用 frontmatter 的 maskStyle 覆盖")
      .addDropdown((dd) => {
        for (const [value, label] of MASK_STYLE_OPTIONS) dd.addOption(value, label);
        dd.setValue(this.plugin.settings.defaultMaskStyle).onChange(async (v) => {
          this.plugin.settings.defaultMaskStyle = v as MaskStyle;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("长答案字符阈值")
      .setDesc("答案超过该字数时建议拆分为独立答案页")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.longAnswerThresholdChars)).onChange(async (v) => {
          const n = Number.parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.longAnswerThresholdChars = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("含展示型公式触发拆分")
      .setDesc("答案中含 $$…$$ 公式块时按长答案处理")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.triggerDisplayMath).onChange(async (v) => {
          this.plugin.settings.triggerDisplayMath = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("含图片触发拆分")
      .setDesc("默认关闭：照片/截图答案保留原地，遮罩揭晓体验更好")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.triggerImage).onChange(async (v) => {
          this.plugin.settings.triggerImage = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("新建错题时的拆分行为")
      .setDesc("ask=弹窗里预选复选框让你确认；auto=直接拆分；off=不拆分")
      .addDropdown((dd) => {
        dd.addOption("ask", "询问我（默认）");
        dd.addOption("auto", "自动拆分");
        dd.addOption("off", "不拆分");
        dd.setValue(this.plugin.settings.splitBehavior).onChange(async (v) => {
          this.plugin.settings.splitBehavior = v as "ask" | "auto" | "off";
          await this.plugin.saveSettings();
        });
      });
  }
}
