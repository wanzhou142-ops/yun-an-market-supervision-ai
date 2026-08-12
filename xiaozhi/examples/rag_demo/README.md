# RAG 教学 Demo（纯标准库，零安装）

把《知识地图_学习路线.md》模块②「RAG 知识库」从"了解"打成"做过"的最小可跑例子。

## 它演示了 RAG 的完整四步
1. **切分**：把 5 部法 txt 切成 688 个 ~300 字的小块
2. **向量化**：用 TF-IDF 把每块变成可比较的向量（模拟"索引"）
3. **检索**：按问题找最相关的 TopK 块
4. **生成**：把检索到的块拼进提示词，交给 LLM 作答

## 怎么跑（Python 3.13，离线）
```bash
cd rag_demo
python rag_demo.py                          # 默认：TF-IDF + TopK=3
python rag_demo.py --query "卖药要什么证"   # 自定义问题
python rag_demo.py --topk 10               # 改 TopK 看差异
python rag_demo.py --mode keyword          # 看"经济模式"为什么翻车
python rag_demo.py --file 药品管理法_2019.txt
```

## 两种模式对应本项目踩的坑
- `--mode tfidf` ≈ **高质量/语义**：按"意思"匹配，换说法也能命中
- `--mode keyword` ≈ **经济模式**：纯字面重叠，换说法就搜不到/跑偏

## 升级成"真·高质量（语义向量）"
本 demo 的 TF-IDF 是"穷人版"语义，仍偏字面。要真正复现 Dify 的"高质量"，
把 `TfidfIndex` 换成 sentence-transformers 即可（需联网装一次）：
```bash
pip install sentence-transformers
# 然后在 query() 里用模型.encode(text) 得到向量，余弦相似度排序
```
这就是本项目知识库选「高质量 + 混合检索」的原因——真语义向量才不怕参观者换说法提问。

## 生成那一步
默认只演示到"组装提示词"。设了 `OPENAI_API_KEY`（和可选 `OPENAI_BASE_URL`）
后会真调用 LLM 返回回答；否则把打印出的提示词贴给任意 LLM 即得答案。
