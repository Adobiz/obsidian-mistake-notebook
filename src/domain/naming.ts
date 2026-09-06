/**
 * 命名与路径构造（纯函数）。集中管理"错题笔记/答案页"的存放约定：
 *
 *   错题笔记: {questionsRoot}/{subject}/{fileBase}.md
 *   答案页:   {answersRoot}/{fileBase}.md
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
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${safeTopic}-${safeSubject}-${stamp}`;
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

/** 答案页的完整路径。 */
export function buildAnswerPath(answersRoot: string, fileBase: string): string {
  return `${answersRoot}/${fileBase}.md`;
}
