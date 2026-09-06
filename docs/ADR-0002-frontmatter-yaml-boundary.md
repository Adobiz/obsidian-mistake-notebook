# ADR-0002：frontmatter 的读写边界

- 状态：Accepted

## 背景

frontmatter 是 YAML。直接在自己的代码里解析/序列化 YAML，既要引入依赖（zod/yaml），又要与 Obsidian 的缓存保持一致，容易出双写不一致。

## 决策

- **读**：一律通过 `app.metadataCache.getFileCache(file)?.frontmatter`（Obsidian 已解析好的对象），再用 `src/domain/frontmatter.ts` 做**运行时校验**（逐字段回退默认值，绝不抛错）。
- **写**：新建文件时用 `src/domain/templates.ts` 的模板拼 YAML 字符串（值统一 `JSON.stringify` 转义，防特殊字符破坏）；修改已有文件用 `app.fileManager.processFrontMatter`。
- 领域层因此**不解析 YAML**，只处理已解析对象与自产字符串——保持了零依赖与可测性。

## 代价

- 模板拼的 YAML 只是"我们生成时保证合法"，若用户手改格式怪异，读侧靠校验兜底。
- metadataCache 对刚写入文件的 frontmatter 可能短暂未刷新（写入后立即读的场景需注意，当前代码路径未依赖）。
