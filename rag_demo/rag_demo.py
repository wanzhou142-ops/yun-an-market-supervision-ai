#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
最小可跑 RAG 教学 Demo（纯标准库，零安装，离线可跑）
=================================================
对应《知识地图_学习路线.md》模块②：RAG 知识库搭建。

本文件把 RAG 的每一步都打印出来，让你看清楚：
  1. 切分（Chunking）  —— 把长文档切成小块
  2. 向量化（Indexing）  —— 把每块转成可比较的"向量"（这里用 TF-IDF 模拟）
  3. 检索（Retrieval）   —— 按问题找最相关的 TopK 块
  4. 生成（Generation）  —— 把检索到的块拼进提示词，交给 LLM 作答

两种检索模式，用来复现本项目踩过的"坑"：
  --mode tfidf   ： TF-IDF 余弦（类似"高质量/语义"，换说法也能命中）
  --mode keyword ： 关键词字面重叠（模拟"经济模式"，换说法就搜不到）

用法：
  python rag_demo.py                         # 用默认示例问题跑 TF-IDF
  python rag_demo.py --query "卖药要什么证"  # 自定义问题
  python rag_demo.py --topk 10               # 改 TopK 看差异
  python rag_demo.py --mode keyword          # 看"经济模式"为什么翻车
  python rag_demo.py --file 药品管理法_2019.txt   # 只用某一部法

如果设置了环境变量 OPENAI_API_KEY（和可选的 OPENAI_BASE_URL），
最后一步会真的调用 LLM 生成回答；否则只打印"喂给 LLM 的提示词"。
"""

import os
import re
import math
import sys
import argparse
from collections import defaultdict

# ---- 路径：脚本在 rag_demo/ 下，知识库在上级目录的 知识库占位资料/ ----
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KB_DIR = os.path.join(BASE_DIR, "知识库占位资料")

CHUNK_SIZE = 300      # 每块约 300 字
CHUNK_OVERLAP = 50    # 块间重叠 50 字，避免把一条法规切断


# ========== 第 1 步：加载 + 切分 ==========
def load_chunks():
    """读取知识库所有 txt，切成带出处的小块。"""
    chunks = []  # 每个元素: {"text":..., "source":...}
    files = sorted(f for f in os.listdir(KB_DIR) if f.endswith(".txt"))
    for fname in files:
        path = os.path.join(KB_DIR, fname)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        # 去掉文档头两行占位说明，避免干扰检索
        text = re.sub(r"^#.*\n#.*\n", "", text)
        start = 0
        while start < len(text):
            piece = text[start:start + CHUNK_SIZE]
            if piece.strip():
                chunks.append({"text": piece, "source": fname})
            start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


# ========== 中文分词（字粒度：单字 + 相邻2字）==========
def tokenize(text):
    """中文没有空格，用「单字 + 二字组合」做 token，纯标准库即可。"""
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"[^\u4e00-\u9fff0-9A-Za-z]", "", text)  # 只留中英文数字
    toks = list(text)
    for i in range(len(text) - 1):
        toks.append(text[i:i + 2])  # 二字组合，捕获"经营""许可"这类词
    return toks


# ========== 第 2 步：向量化（TF-IDF 索引）==========
class TfidfIndex:
    """用 TF-IDF 把每块变成向量。语义检索的"穷人版"，但足以演示原理。"""
    def __init__(self, chunks):
        self.chunks = chunks
        self.N = len(chunks)
        self.df = defaultdict(int)
        self.doc_vecs = []
        for c in chunks:
            t = tokenize(c["text"])
            tf = defaultdict(int)
            for w in t:
                tf[w] += 1
            for w in tf:
                self.df[w] += 1
            # TF-IDF 加权
            vec = {}
            for w, cnt in tf.items():
                idf = math.log((self.N + 1) / (self.df[w] + 1)) + 1
                vec[w] = cnt * idf
            norm = math.sqrt(sum(v * v for v in vec.values())) or 1
            self.doc_vecs.append({w: v / norm for w, v in vec.items()})

    def query(self, q, topk=3):
        qt = tokenize(q)
        qv = defaultdict(int)
        for w in qt:
            qv[w] += 1
        vec = {}
        for w, cnt in qv.items():
            idf = math.log((self.N + 1) / (self.df.get(w, 0) + 1)) + 1
            vec[w] = cnt * idf
        qnorm = math.sqrt(sum(v * v for v in vec.values())) or 1
        vec = {w: v / qnorm for w, v in vec.items()}
        scores = []
        for i, dv in enumerate(self.doc_vecs):
            dot = sum(v * vec[w] for w, v in dv.items() if w in vec)
            scores.append((dot, i))
        scores.sort(reverse=True)
        return scores[:topk]


class KeywordIndex:
    """模拟"经济模式"：纯字面关键词重叠，换说法就匹配不上。"""
    def __init__(self, chunks):
        self.chunks = chunks
        self.toks = [set(tokenize(c["text"])) for c in chunks]

    def query(self, q, topk=3):
        qt = set(tokenize(q))
        scores = []
        for i, ct in enumerate(self.toks):
            ov = len(qt & ct)  # 共享的 token 数量
            scores.append((ov, i))
        scores.sort(reverse=True)
        return scores[:topk]


# ========== 第 4 步：组装"喂给 LLM 的提示词" ==========
def build_prompt(query, hits, chunks):
    ctx = []
    for rank, (score, idx) in enumerate(hits, 1):
        ctx.append(f"[资料{idx}](出处:{chunks[idx]['source']})\n{chunks[idx]['text'].strip()}")
    context = "\n\n".join(ctx)
    return (
        "你是市场监管普法助手，只根据下面的资料回答，不要编造资料以外的法条。\n\n"
        f"【资料】\n{context}\n\n"
        f"【问题】{query}\n\n请引用资料中的具体条文作答。"
    )


# ========== 可选：真调用 LLM（需 OPENAI_API_KEY）==========
def call_llm(prompt):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    import urllib.request
    import json
    base = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    body = json.dumps({
        "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": "你是严谨的市场监管普法助手。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }).encode("utf-8")
    req = urllib.request.Request(
        base + "/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"[调用 LLM 失败，仅返回提示词] {e}"


# ========== 主流程 ==========
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", default="卖药需要办理什么许可证")
    ap.add_argument("--topk", type=int, default=3)
    ap.add_argument("--mode", choices=["tfidf", "keyword"], default="tfidf")
    ap.add_argument("--file", default=None, help="只用某一部法，如 药品管理法_2019.txt")
    args = ap.parse_args()

    print("=" * 64)
    print("RAG 教学 Demo —— 第 1 步：加载 + 切分")
    print("=" * 64)
    chunks = load_chunks()
    if args.file:
        chunks = [c for c in chunks if c["source"] == args.file]
    print(f"知识库文件数：{len(set(c['source'] for c in chunks))}（已合并切分）")
    print(f"切分后片段总数：{len(chunks)} 块（每块约 {CHUNK_SIZE} 字，重叠 {CHUNK_OVERLAP} 字）")
    print(f"示例片段[0]前 60 字：\n  {chunks[0]['text'][:60]}...")

    print("\n" + "=" * 64)
    mode_name = "TF-IDF 语义（≈高质量）" if args.mode == "tfidf" else "关键词字面（≈经济模式）"
    print(f"第 2+3 步：向量化 + 检索（模式={mode_name}，TopK={args.topk}）")
    print("=" * 64)
    index = TfidfIndex(chunks) if args.mode == "tfidf" else KeywordIndex(chunks)
    hits = index.query(args.query, topk=args.topk)
    print(f"问题：{args.query}\n")
    for rank, (score, idx) in enumerate(hits, 1):
        snippet = chunks[idx]["text"][:80].replace("\n", " ")
        print(f"  #{rank}  得分={score:.4f}  块#{idx}  出处={chunks[idx]['source']}")
        print(f"       片段：{snippet}...")

    print("\n" + "=" * 64)
    print("第 4 步：组装「喂给 LLM 的提示词」（检索增强的核心）")
    print("=" * 64)
    prompt = build_prompt(args.query, hits, chunks)
    print(prompt[:600] + ("\n  ...(省略后续资料)" if len(prompt) > 600 else ""))

    answer = call_llm(prompt)
    print("\n" + "=" * 64)
    if answer is None:
        print("生成：未设置 OPENAI_API_KEY，仅演示到「检索+组装提示词」为止。")
        print("想看真回答：设置 OPENAI_API_KEY 后重跑（或把上面提示词贴给任意 LLM）。")
    else:
        print("LLM 生成回答：")
        print(answer)
    print("=" * 64)


if __name__ == "__main__":
    main()
