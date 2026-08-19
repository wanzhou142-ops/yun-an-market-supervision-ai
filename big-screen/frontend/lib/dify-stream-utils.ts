/** 合并 Dify 流式 answer（兼容增量 chunk 与累积全文两种格式）。 */
export function mergeStreamAnswer(current: string, chunk: string): string {
  if (!chunk) return current;
  if (!current) return chunk;
  if (chunk === current) return current;
  if (chunk.startsWith(current) && chunk.length > current.length) return chunk;
  if (current.endsWith(chunk)) return current;
  if (current.includes(chunk) && chunk.length < current.length / 2) return current;
  return current + chunk;
}

/** 从 workflow_finished 等事件提取最终答案。 */
export function extractAnswerFromEvent(evt: Record<string, unknown>): string {
  const data = evt.data as Record<string, unknown> | undefined;
  const outputs = data?.outputs as Record<string, unknown> | undefined;
  if (!outputs) return "";
  for (const key of ["answer", "text", "result"]) {
    const v = outputs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** 是否适合送 TTS（过滤空句、纯标点、括号占位等）。 */
export function isSpeakableSentence(text: string): boolean {
  const t = text
    .replace(/[（(][^（）()]*[）)]/g, "")
    .replace(/[#*_`[\]]/g, "")
    .trim();
  if (t.length < 2) return false;
  return /[\u4e00-\u9fffA-Za-z0-9]/.test(t);
}
