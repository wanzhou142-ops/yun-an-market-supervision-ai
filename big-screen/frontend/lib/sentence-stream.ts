/** 从 Dify 累积全文中切出「新完成的句子」（保留未闭合尾部）。 */
export function splitStreamingSentences(
  fullText: string,
  emittedLen: number
): { sentences: string[]; emittedLen: number } {
  const chunk = fullText.slice(emittedLen);
  if (!chunk) return { sentences: [], emittedLen };

  const sentences: string[] = [];
  let buf = "";
  for (const ch of chunk) {
    buf += ch;
    if (/[。！？；!?]/.test(ch) || ch === "\n") {
      const s = buf.trim();
      if (s) sentences.push(s);
      buf = "";
    }
  }
  return { sentences, emittedLen: fullText.length - buf.length };
}
