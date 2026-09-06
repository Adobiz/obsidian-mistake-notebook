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
  ["mosaic", "马赛克（Mosaic）"],
  ["black", "纯黑（Black）"],
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
      .setName("答案页跟随错题目录")
      .setDesc(
        "开启后，拆分出的答案页生成在错题笔记所在目录内（可再选是否建子文件夹）；" +
          "关闭则使用上方答案页根目录。仅影响之后生成的答案页，不迁移已有文件",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.answersFollowQuestions).onChange(async (v) => {
          this.plugin.settings.answersFollowQuestions = v;
          await this.plugin.saveSettings();
          this.display(); // 重渲染，让子开关跟随主开关出现/消失
        }),
      );

    // 子开关：仅主开关开启时显示并生效
    if (this.plugin.settings.answersFollowQuestions) {
      new Setting(containerEl)
        .setName("在错题目录内创建答案文件夹")
        .setDesc(
          `开启后，答案页统一放入 错题目录/${this.plugin.settings.answersRoot}/ 子文件夹；` +
            "关闭则与错题笔记同目录存放",
        )
        .addToggle((t) =>
          t.setValue(this.plugin.settings.answersSubfolderWhenFollowing).onChange(async (v) => {
            this.plugin.settings.answersSubfolderWhenFollowing = v;
            await this.plugin.saveSettings();
          }),
        );
    }

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
      .setName("极简模式")
      .setDesc(
        "开启后录入错题只需题目与答案（学科等自动记为未分类，稍后可在笔记里补），" +
          "界面隐藏属性面板与反链等杂项；用命令「切换极简模式」随时开关",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.minimalMode).onChange(async (v) => {
          this.plugin.settings.minimalMode = v;
          await this.plugin.saveSettings();
          this.plugin.applyMinimalMode();
        }),
      );

    new Setting(containerEl)
      .setName("隐藏错题笔记的属性区")
      .setDesc(
        "查看错题笔记与答案页时，顶部不再显示 frontmatter 属性面板（id/学科/answerMode 等）。" +
          "数据仍完整写入文件，仅隐藏显示；其他笔记不受影响",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.hideMistakeProperties).onChange(async (v) => {
          this.plugin.settings.hideMistakeProperties = v;
          await this.plugin.saveSettings();
          this.plugin.applyPropertyVisibility();
        }),
      );

    new Setting(containerEl)
      .setName("自动开启题目显示强调")
      .setDesc(
        "新建/插入错题时自动把题目包进红色强调块，与蓝色答案块视觉配对；" +
          "关闭则题目保持普通文字。也可选中文字后右键「题目显示强调」手动开关（toggle）",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoQuestionEmphasis).onChange(async (v) => {
          this.plugin.settings.autoQuestionEmphasis = v;
          await this.plugin.saveSettings();
        }),
      );

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
