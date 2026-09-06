/**
 * 命名与路径构造（纯函数）。集中管理"错题笔记/答案页"的存放约定：
 *
 *   错题笔记: {questionsRoot}/{subject}/{fileBase}.md
 *   答案页:   {answersRoot}/{fileBase}-答案.md
 *
 * fileBase 由"主题词 + 学科 + 时间戳"组成，保证同目录内唯一。
 * 目录与文件名全部禁止路径穿越字符（用户输入的学科/主题会被清洗）。
 */

/** 清洗为安全文件名片段：只保留中英文/数字/常用符号，去掉路径分隔与危险字符。 */
export function sanitizeNamePart(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|\n\r\t]/g, "")
    .replace(/^\.+/, "") // 去掉前导点号，避免隐藏文件/“..”开头
    .trim();
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
}

/** 生成错题 ID：mt-YYYYMMDD-<学科首2字>-<6位随机>，形如 mt-20250212-数-3fa9c1。 */
export function generateMistakeId(now: Date, subject: string): string {
  const ymd = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const subjectTag = sanitizeNamePart(subject).slice(0, 4) || "un";
  const rand = Math.random().toString(36).slice(2, 8);
  return `mt-${ymd}-${subjectTag}-${rand}`;
}

/** 主题词（用于文件名）：默认取用户输入的"题目要点/名称"，清洗后作文件名主干。 */
export function buildFileBase(subject: string, topic: string, now: Date): string {
  const safeTopic = sanitizeNamePart(topic) || "错题";
  const safeSubject = sanitizeNamePart(subject) || "未分类";
  // 精确到秒：分钟粒度下同一分钟内重复创建同主题错题会撞名
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `${safeTopic}-${safeSubject}-${stamp}`;
}

/**
 * 文件名主干唯一化：base 对应文件已存在时追加 -2/-3… 直到唯一。
 * exists 由适配层注入（vault 查询），保持本函数可单测。
 */
export function uniquifyFileBase(base: string, exists: (candidate: string) => boolean): string {
  if (!exists(base)) return base;
  let n = 2;
  while (exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** 题目笔记的完整路径。 */
export function buildQuestionPath(
  questionsRoot: string,
  subject: string,
  fileBase: string,
): string {
  const safeSubject = sanitizeNamePart(subject) || "未分类";
  return `${questionsRoot}/${safeSubject}/${fileBase}.md`;
}

/**
 * 答案页文件名主干：题目文件名加 "-答案" 后缀。
 * 两页绝不能同名——Obsidian 对重名文件的裸 wikilink 优先解析到当前笔记
 * 所在文件夹的那份，会让"查看完整答案/返回题目"两个链接都解析回笔记自己。
 */
export function buildAnswerBase(questionFileBase: string): string {
  return `${questionFileBase}-答案`;
}

/** 目录路径归一：去首尾空白与尾部斜杠，根目录（"/"）归一为空串。 */
function normalizeDir(dir: string): string {
  return dir.trim().replace(/\/+$/, "");
}

/**
 * 决定答案页所在目录：
 *  - 跟随关闭 → 独立答案目录（answersRoot）；
 *  - 跟随开启、子开关关闭 → 错题笔记同目录（questionDir）；
 *  - 跟随开启、子开关开启 → 错题目录内的 answersRoot 同名子文件夹。
 * 目录为 vault 根（"" 或 "/"）时归一为 ""，让 buildAnswerPath 产出无前缀路径。
 */
export function resolveAnswerDir(
  followQuestions: boolean,
  answersRoot: string,
  questionDir: string,
  subfolderInQuestionDir = false,
): string {
  const root = normalizeDir(answersRoot);
  if (!followQuestions) return root;
  const dir = normalizeDir(questionDir);
  return subfolderInQuestionDir ? (dir === "" ? root : `${dir}/${root}`) : dir;
}

/** 答案页的完整路径。answerDir 传 "" 表示 vault 根目录。 */
export function buildAnswerPath(answerDir: string, questionFileBase: string): string {
  const name = `${buildAnswerBase(questionFileBase)}.md`;
  return answerDir === "" ? name : `${answerDir}/${name}`;
}
