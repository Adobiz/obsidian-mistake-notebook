/**
 * 设置面板（PluginSettingTab）。文案全部走 i18n（t()），语言切换后 display() 即时重渲染。
 */

import { PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import type MistakeNotebookPlugin from "./main";
import type { MaskStyle } from "./domain/types";
import { t, type MsgKey } from "./i18n";

/** 遮罩风格下拉：值固定，标签按语言取文案。 */
const MASK_OPTIONS: Array<[MaskStyle, MsgKey]> = [
  ["blur", "mask.blur"],
  ["white", "mask.white"],
  ["mosaic", "mask.mosaic"],
  ["black", "mask.black"],
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
    new Setting(containerEl).setName(t("set.heading")).setHeading();

    // ---- 界面语言（首项）：auto 跟随 Obsidian，或手动中/英 ----
    new Setting(containerEl)
      .setName(t("set.language"))
      .setDesc(t("set.languageDesc"))
      .addDropdown((dd) => {
        dd.addOption("auto", t("set.langAuto"));
        dd.addOption("zh", t("set.langZh"));
        dd.addOption("en", t("set.langEn"));
        dd.setValue(this.plugin.settings.language).onChange(async (v) => {
          this.plugin.settings.language = v as "auto" | "zh" | "en";
          await this.plugin.saveSettings();
          this.plugin.applyLanguage();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("set.qRoot"))
      .setDesc(t("set.qRootDesc"))
      .addText((tf) =>
        tf.setValue(this.plugin.settings.questionsRoot).onChange(async (v) => {
          this.plugin.settings.questionsRoot = v.trim() || "错题本";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.aRoot"))
      .setDesc(t("set.aRootDesc"))
      .addText((tf) =>
        tf.setValue(this.plugin.settings.answersRoot).onChange(async (v) => {
          this.plugin.settings.answersRoot = v.trim() || "答案";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.follow"))
      .setDesc(t("set.followDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.answersFollowQuestions).onChange(async (v) => {
          this.plugin.settings.answersFollowQuestions = v;
          await this.plugin.saveSettings();
          this.display(); // 重渲染，让子开关跟随主开关出现/消失
        }),
      );

    // 子开关：仅主开关开启时显示并生效
    if (this.plugin.settings.answersFollowQuestions) {
      new Setting(containerEl)
        .setName(t("set.subfolder"))
        .setDesc(t("set.subfolderDesc", { name: this.plugin.settings.answersRoot }))
        .addToggle((tg) =>
          tg.setValue(this.plugin.settings.answersSubfolderWhenFollowing).onChange(async (v) => {
            this.plugin.settings.answersSubfolderWhenFollowing = v;
            await this.plugin.saveSettings();
          }),
        );
    }

    new Setting(containerEl)
      .setName(t("set.maskStyle"))
      .setDesc(t("set.maskStyleDesc"))
      .addDropdown((dd) => {
        for (const [value, labelKey] of MASK_OPTIONS) dd.addOption(value, t(labelKey));
        dd.setValue(this.plugin.settings.defaultMaskStyle).onChange(async (v) => {
          this.plugin.settings.defaultMaskStyle = v as MaskStyle;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(t("set.minimal"))
      .setDesc(t("set.minimalDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.minimalMode).onChange(async (v) => {
          this.plugin.settings.minimalMode = v;
          await this.plugin.saveSettings();
          this.plugin.applyMinimalMode();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.hideProps"))
      .setDesc(t("set.hidePropsDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.hideMistakeProperties).onChange(async (v) => {
          this.plugin.settings.hideMistakeProperties = v;
          await this.plugin.saveSettings();
          this.plugin.applyPropertyVisibility();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.autoEmph"))
      .setDesc(t("set.autoEmphDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.autoQuestionEmphasis).onChange(async (v) => {
          this.plugin.settings.autoQuestionEmphasis = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.threshold"))
      .setDesc(t("set.thresholdDesc"))
      .addText((tf) =>
        tf.setValue(String(this.plugin.settings.longAnswerThresholdChars)).onChange(async (v) => {
          const n = Number.parseInt(v, 10);
          if (Number.isFinite(n) && n > 0) {
            this.plugin.settings.longAnswerThresholdChars = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName(t("set.mathSplit"))
      .setDesc(t("set.mathSplitDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.triggerDisplayMath).onChange(async (v) => {
          this.plugin.settings.triggerDisplayMath = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.imgSplit"))
      .setDesc(t("set.imgSplitDesc"))
      .addToggle((tg) =>
        tg.setValue(this.plugin.settings.triggerImage).onChange(async (v) => {
          this.plugin.settings.triggerImage = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("set.splitBehavior"))
      .setDesc("ask / auto / off")
      .addDropdown((dd) => {
        dd.addOption("ask", t("set.splitAsk"));
        dd.addOption("auto", t("set.splitAuto"));
        dd.addOption("off", t("set.splitOff"));
        dd.setValue(this.plugin.settings.splitBehavior).onChange(async (v) => {
          this.plugin.settings.splitBehavior = v as "ask" | "auto" | "off";
          await this.plugin.saveSettings();
        });
      });
  }
}
