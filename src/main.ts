/**
 * 插件入口：装配领域层/适配层/UI，注册命令与阅读视图遮罩。
 *
 * 分层原则：main.ts 只做"组装与生命周期"，不承载业务逻辑。
 */

import { Notice, Plugin } from "obsidian";
import type { Editor, Menu, MenuItem, TFile } from "obsidian";
import { MistakeNoteService } from "./adapter/noteService";
import { createAnswerMaskPostProcessor } from "./postprocessors/answerMask";
import { MistakeSettingTab } from "./settingsTab";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settings";
import type { MistakeSettings } from "./settings";
import { NewMistakeModal, type NewMistakeMode } from "./ui/NewMistakeModal";
import { toggleQuestionEmphasis } from "./ui/questionEmphasis";
import { DASHBOARD_VIEW_TYPE, MistakeDashboardView } from "./ui/dashboardView";
import { detectObsidianLanguage, resolveLanguage, setCurrentLanguage, t } from "./i18n";

export default class MistakeNotebookPlugin extends Plugin {
  /** 覆盖基类 Plugin.settings（见 obsidian 1.13+ 类型），用具体类型收窄。 */
  override settings: MistakeSettings = DEFAULT_SETTINGS;
  private service!: MistakeNoteService;

  override async onload(): Promise<void> {
    await this.loadSettings();
    this.service = new MistakeNoteService(this.app, () => this.settings);
    this.applyMinimalMode();
    this.applyPropertyVisibility();
    this.updateMistakeViewClass();
    // 切换笔记时更新"正在看错题/答案页"标记，供属性区隐藏的 CSS 作用域使用
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateMistakeViewClass()));
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.updateMistakeViewClass()),
    );

    // 阅读视图：遮住 [!answer] 答案块（四种风格 + 点击揭晓）
    this.registerMarkdownPostProcessor(
      createAnswerMaskPostProcessor(this.app, () => this.settings),
    );

    this.addSettingTab(new MistakeSettingTab(this.app, this));

    // 仪表盘：左侧边栏视图 + ribbon 图标入口（tooltip 随启动语言，重载后更新）
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new MistakeDashboardView(leaf, () => this.settings),
    );
    this.addRibbonIcon("bar-chart-3", t("dash.title"), () => void this.activateDashboard());

    // 编辑视图右键菜单：一级入口"插入错题"（二级：就地插入/新建页）+ 题目强调。
    // editor-menu 只在编辑视图（源码/实时预览）触发；菜单每次右键即时取文案（t()），
    // 语言切换无需重建。setSubmenu 尚未进官方类型（1.13.1），做存在性探测降级。
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const hostFile = view.file;
        const openInsert = (): void => {
          if (hostFile === null) {
            new Notice(t("notice.openNoteFirst"));
            return;
          }
          this.openNewMistakeModal("insert", { editor, hostFile });
        };
        const openCreate = (): void => this.openNewMistakeModal("create");

        menu.addItem((item) => {
          item.setTitle(t("menu.insert")).setIcon("file-plus").setSection("mistake-notebook");
          const host = item as MenuItem & { setSubmenu?: () => Menu };
          if (typeof host.setSubmenu === "function") {
            const sub = host.setSubmenu();
            sub.addItem((si) => si.setTitle(t("menu.insertHere")).onClick(openInsert));
            sub.addItem((si) => si.setTitle(t("menu.newPage")).onClick(openCreate));
          } else {
            menu.addItem((a) =>
              a
                .setTitle(t("menu.insertHereFlat"))
                .setIcon("file-plus")
                .setSection("mistake-notebook")
                .onClick(openInsert),
            );
            menu.addItem((b) =>
              b
                .setTitle(t("menu.newPageFlat"))
                .setIcon("file-plus")
                .setSection("mistake-notebook")
                .onClick(openCreate),
            );
          }
        });

        // 独立入口：选中题目文字后强调/取消强调（toggle），无选中置灰
        menu.addItem((item) =>
          item
            .setTitle(t("menu.emphasize"))
            .setIcon("highlighter")
            .setSection("mistake-notebook")
            .setDisabled(editor.getSelection() === "")
            .onClick(() => toggleQuestionEmphasis(editor)),
        );
      }),
    );

    // 语言：解析并注册全部命令（命令名随语言，切换后重新注册覆盖）
    this.applyLanguage();
  }

  /** 命令面板入口全部在这里注册；语言切换时重调（同 id 覆盖旧命令）。 */
  registerCommands(): void {
    this.addCommand({
      id: "create-mistake",
      name: t("cmd.newMistake"),
      callback: () => this.openNewMistakeModal("create"),
    });

    this.addCommand({
      id: "insert-mistake-here",
      name: t("cmd.insertMistake"),
      editorCallback: (editor, view) => {
        const hostFile = view.file;
        if (hostFile === null) {
          new Notice(t("notice.openNoteFirst"));
          return;
        }
        this.openNewMistakeModal("insert", { editor, hostFile });
      },
    });

    this.addCommand({
      id: "toggle-minimal-mode",
      name: t("cmd.toggleMinimal"),
      callback: () => void this.toggleMinimalMode(),
    });

    this.addCommand({
      id: "split-current-note-answer",
      name: t("cmd.splitNote"),
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

    this.addCommand({
      id: "open-dashboard",
      name: t("cmd.openDashboard"),
      callback: () => void this.activateDashboard(),
    });
  }

  /** 语言生效：更新当前语言 → 重注册命令 → 刷新已打开的仪表盘。 */
  applyLanguage(): void {
    setCurrentLanguage(resolveLanguage(this.settings.language, detectObsidianLanguage()));
    this.registerCommands();
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof MistakeDashboardView) view.renderDashboard();
    }
  }

  override onunload(): void {
    // 本插件注入的 body class 在卸载时亲手清掉。
    document.body.classList.remove("mt-minimal", "mt-hide-properties", "mt-viewing-mistake");
  }

  /** 极简模式只改观感（body class），不碰任何笔记数据；退出走「切换极简模式」命令。 */
  applyMinimalMode(): void {
    document.body.classList.toggle("mt-minimal", this.settings.minimalMode);
  }

  /** 属性区隐藏只影响显示层：frontmatter 数据始终完整写入文件。 */
  applyPropertyVisibility(): void {
    document.body.classList.toggle("mt-hide-properties", this.settings.hideMistakeProperties);
  }

  /** 判断当前活动笔记是否是错题笔记（id: mt-*）或答案页（mt-answer-of）。 */
  private isMistakeFile(): boolean {
    const file = this.app.workspace.getActiveFile();
    if (file === null) return false;
    const rawFm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (rawFm === undefined) return false;
    const fm: Record<string, unknown> = rawFm;
    const id = fm["id"];
    return (typeof id === "string" && id.startsWith("mt-")) || fm["mt-answer-of"] !== undefined;
  }

  private updateMistakeViewClass(): void {
    document.body.classList.toggle("mt-viewing-mistake", this.isMistakeFile());
  }

  private async toggleMinimalMode(): Promise<void> {
    this.settings.minimalMode = !this.settings.minimalMode;
    await this.saveSettings();
    this.applyMinimalMode();
    new Notice(this.settings.minimalMode ? t("notice.minimalOn") : t("notice.minimalOff"));
  }

  /** 打开（或聚焦已打开的）左侧仪表盘视图。 */
  private async activateDashboard(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
    const leaf = existing[0] ?? workspace.getLeftLeaf(false);
    if (leaf === null) return;
    // 注意：revealLeaf/@since 1.7.2、ViewState.active/@since 1.7.2 都超出 minAppVersion，
    // 用 0.16.3 就有的 setActiveLeaf 完成激活
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE });
    workspace.setActiveLeaf(leaf, { focus: true });
  }

  /** 录入入口统一走这里：命令面板与编辑器右键菜单共用。 */
  private openNewMistakeModal(
    mode: NewMistakeMode = "create",
    ctx?: {
      editor: Editor;
      hostFile: TFile;
    },
  ): void {
    new NewMistakeModal(this.app, this.service, () => this.settings, {
      mode,
      editor: ctx?.editor,
      hostFile: ctx?.hostFile,
    }).open();
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
