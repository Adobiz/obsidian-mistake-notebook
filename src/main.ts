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

    // 阅读视图：遮住 [!answer] 答案块（模糊/纯白 + 点击揭晓）
    this.registerMarkdownPostProcessor(
      createAnswerMaskPostProcessor(this.app, () => this.settings),
    );

    this.addSettingTab(new MistakeSettingTab(this.app, this));

    // 仪表盘：左侧边栏视图 + ribbon 图标入口
    this.registerView(
      DASHBOARD_VIEW_TYPE,
      (leaf) => new MistakeDashboardView(leaf, () => this.settings),
    );
    this.addRibbonIcon("bar-chart-3", "错题仪表盘", () => void this.activateDashboard());
    this.addCommand({
      id: "open-dashboard",
      name: "打开错题仪表盘",
      callback: () => void this.activateDashboard(),
    });

    this.addCommand({
      id: "create-mistake",
      name: "新建错题（含答案遮罩）",
      callback: () => this.openNewMistakeModal("create"),
    });

    this.addCommand({
      id: "insert-mistake-here",
      name: "在当前位置插入错题（含答案遮罩）",
      editorCallback: (editor, view) => {
        const hostFile = view.file;
        if (hostFile === null) {
          new Notice("请先打开一篇笔记再插入错题。");
          return;
        }
        this.openNewMistakeModal("insert", { editor, hostFile });
      },
    });

    // 编辑视图右键菜单：一级入口"插入错题"，下挂两个二级选项，与命令面板共用逻辑。
    // 注意 editor-menu 只在编辑视图（源码/实时预览）触发，阅读视图无公开注入 API。
    // 二级菜单（setSubmenu）已在运行时存在但尚未进官方类型（1.13.1），做存在性探测，
    // 老版本自动降级为两个平铺一级项。
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        const hostFile = view.file;
        const openInsert = (): void => {
          if (hostFile === null) {
            new Notice("请先打开一篇笔记再插入错题。");
            return;
          }
          this.openNewMistakeModal("insert", { editor, hostFile });
        };
        const openCreate = (): void => this.openNewMistakeModal("create");

        menu.addItem((item) => {
          item.setTitle("插入错题").setIcon("file-plus").setSection("mistake-notebook");
          const host = item as MenuItem & { setSubmenu?: () => Menu };
          if (typeof host.setSubmenu === "function") {
            const sub = host.setSubmenu();
            sub.addItem((si) => si.setTitle("在当前位置插入").onClick(openInsert));
            sub.addItem((si) => si.setTitle("新建错题页面").onClick(openCreate));
          } else {
            menu.addItem((a) =>
              a
                .setTitle("插入错题 · 在当前位置插入")
                .setIcon("file-plus")
                .setSection("mistake-notebook")
                .onClick(openInsert),
            );
            menu.addItem((b) =>
              b
                .setTitle("插入错题 · 新建错题页面")
                .setIcon("file-plus")
                .setSection("mistake-notebook")
                .onClick(openCreate),
            );
          }
        });

        // 独立入口：选中题目文字后强调/取消强调（toggle），无选中置灰
        menu.addItem((item) =>
          item
            .setTitle("题目显示强调")
            .setIcon("highlighter")
            .setSection("mistake-notebook")
            .setDisabled(editor.getSelection() === "")
            .onClick(() => toggleQuestionEmphasis(editor)),
        );
      }),
    );

    this.addCommand({
      id: "toggle-minimal-mode",
      name: "切换极简模式",
      callback: () => void this.toggleMinimalMode(),
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
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter as
      Record<string, unknown> | undefined;
    if (fm === undefined) return false;
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
    new Notice(`极简模式已${this.settings.minimalMode ? "开启" : "关闭"}。`);
  }

  /** 打开（或聚焦已打开的）左侧仪表盘视图。 */
  private async activateDashboard(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
    const leaf = existing[0] ?? workspace.getLeftLeaf(false);
    if (leaf === null) return;
    await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
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
