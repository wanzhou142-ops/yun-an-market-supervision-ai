# 模拟药店找茬 — 分区数据

本目录存放 Excel 两表解析后的**分区结果**，便于后续把题号挪到其他子区域。

## 文件说明

| 文件 | 用途 |
|------|------|
| [`partition.json`](partition.json) | 机器可读：每题 `area` / `subArea` / 有图 / 题干 |
| [`partition-review.csv`](partition-review.csv) | **编辑此文件** 调整分区，改 `subArea` 列即可 |
| [`partition-summary.md`](partition-summary.md) | 人类可读：按考区/子区汇总的**题号列表** |

## 重新生成分区

```bash
python big-screen/frontend/scripts/build-pharmacy-partition.py
```

> 注意：重跑脚本会覆盖 JSON/CSV/MD。若已手工改 CSV，请先备份或改为直接改 `partition.json`。

## 当前规则（2026-08-19）

- **考区** `area`：`drug` 药品 · `nondrug` 非药品 · `newretail` 新零售
- **子区** `subArea`（仅 non drug）：`food` · `device` · `cosmetic` · `other` · `price` · `ad`
- 难以划分 / 通用题 → `nondrug` + `other`（其他产品区）
- 无图题本期跳过；每区随机 **3** 题

## 如何挪题到其他子区

1. 打开 `partition-review.csv`
2. 找到 `problemId`，修改 `subArea`（如 `other` → `food`）
3. 保存后同步到 `partition.json` 的 `problems[id].subArea` 与 `byArea` 索引（或告知开发重跑导入脚本）

**其他产品区（other）当前题号** — 见 [`partition-summary.md#其他产品区other--便于后续挪移`](partition-summary.md)
