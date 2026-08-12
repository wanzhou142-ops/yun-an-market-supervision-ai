# 考模块：题库外置（不写死在代码里）配置指南

> 适用：你现在的 `training-flow.fixed.yml`（第一版，内置 8 题版）已在跑通、判分已修好。  
> 本指南只改「题库来源」这一处，**状态机完全不动**（会话变量、条件分支、抽题/收答案/判分、两个变量赋值都保留）。  
> 在画布上手改即可，**不要**重新导入 DSL。

---

## 一、先记住一句核心

**题库只在「抽题」那一轮解析一次，解析完立刻存进会话变量 `conversation.questions`，之后所有轮次都只读 `conversation.questions`，不再碰你上传的文件。**

所以你担心的「逐轮重跑，文件还在不在」——答案是：**第一轮就用完存盘了，后面根本不依赖它**。这正是状态机设计的好处。

---

## 二、为什么不能用「粘贴 JSON 文本」

Dify 开始节点的**文本类型输入字段**有 **48 字符限制**（见报错 `question_bank in input form must be less than 48 characters`）。  
JSON 题库随便一贴就超过 48 字符，所以**文本字段方案不可行**。

**唯一可行路线：开始节点加「文件」类型字段，用文件上传。** 文件附件没有 48 字符限制。

---

## 三、文件上传方案（唯一可行路线）

### 1. 开始节点加一个文件变量
- 开始节点 → 变量区 → 新增：`question_file`，类型 **文件**（File）。
- 原来的 `mode`/`num` 不变。

### 2. 在 `total==0` 分支里、抽题节点**之前**加「文档提取器」节点
- 连线：`branch_status(total==0)` → `文档提取器` → `抽题(extract)` → `assign1` → `reply_first`。
- 文档提取器：输入 `question_file`，输出变量名设为 `text`（默认就是 `text`）。
- 只有第一轮（`total==0`）会走这条分支，所以文件只解析一次。

### 3. 抽题（extract）节点：输入改 `text`，代码用健壮解析版
- **输入变量**：接收 `text`（文档提取器输出）和 `num`。
- **代码整体替换为：**

```python
import json, re, random

# 内置兜底题库（仅当没上传文件或解析失败时用）
FALLBACK = [
    {"id":1,"type":"single","topic":"药品监管",
     "stem":"非药品在广告中不得涉及下列哪项内容？",
     "options":["A. 产品名称","B. 疾病预防、治疗功能","C. 适用人群","D. 生产厂家"],
     "answer":"B","analysis":"非药品不得宣传疾病预防治疗功能。"},
    {"id":3,"type":"judge","topic":"消费者权益",
     "stem":"网络购物消费者有权七日无理由退货。",
     "options":["A. 正确","B. 错误"],"answer":"A",
     "analysis":"《消费者权益保护法》第二十五条。"},
    {"id":4,"type":"multi","topic":"广告法",
     "stem":"下列哪些属于禁止的绝对化用语？",
     "options":["A. 国家级","B. 最高级","C. 最佳","D. 质优"],
     "answer":"ABC","analysis":"《广告法》第九条。"},
]

def main(text, num) -> dict:
    type_map = {"single":"单选","multi":"多选","judge":"判断"}
    raw = (text or "").strip()
    # 去掉可能的 markdown 代码块包裹
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw).strip()

    questions, error = [], ""
    if not raw:
        questions = FALLBACK
    elif raw.startswith("["):
        try:
            questions = json.loads(raw)
        except Exception as e:
            error = f"JSON 解析失败：{e}"
    elif raw.startswith("|"):
        questions = parse_md_table(raw)
        if not questions: error = "未识别为 Markdown 表格"
    else:
        error = "题库为空或格式无法识别（JSON 或 表格）"

    if error:
        return {"questions":[], "total":0, "error":error, "first_question":""}

    # 兼容 CSV：options 是字符串时按 | 拆分
    clean = []
    for q in questions:
        q = dict(q)
        if isinstance(q.get("options"), str):
            q["options"] = [o.strip() for o in q["options"].split("|") if o.strip()]
        clean.append(q)

    n = max(1, min(int(num or 5), len(clean)))
    picked = random.sample(clean, n)
    for i,q in enumerate(picked): q["index"]=i+1
    first = picked[0]
    t = type_map.get(first.get("type",""), first.get("type",""))
    fq = f"第 1 题（{t}）：{first.get('stem','')}\n"+"\n".join(first.get("options") or [])
    return {"questions":picked,"total":n,"error":"","first_question":fq}

def parse_md_table(raw):
    lines = [l for l in raw.splitlines() if l.strip().startswith("|")]
    if len(lines) < 2: return []
    header = [h.strip() for h in lines[0].strip("|").split("|")]
    out = []
    for l in lines[2:]:  # 跳过分隔行
        cells = [c.strip() for c in l.strip("|").split("|")]
        if len(cells) != len(header): continue
        out.append(dict(zip(header, cells)))
    return out
```

- 输出变量不变：`questions`(Array[Object]) / `total`(Number) / `first_question`(String) / `error`(String)。

### 4. 其余节点一律不动
抽题后的 `assign1`、收答案 `submit`/`assign2`、判分 `grade`、所有条件分支、直接回复 —— **全部保持你现在的样子**。

---

## 四、题库文件规范（给客户填）

### 方案 1：JSON 文件（推荐）
文件名随意，建议 `题库.json`，内容是一个数组：

```json
[
  {"id":1,"type":"single","topic":"药品","stem":"处方药销售必须凭什么？","options":["A. 身份证","B. 执业医师处方","C. 会员卡","D. 营业执照"],"answer":"B","analysis":"处方药须凭执业医师处方销售。"},
  {"id":2,"type":"judge","topic":"广告","stem":"广告可以使用'国家级'用语。","options":["A. 正确","B. 错误"],"answer":"B","analysis":"《广告法》禁用绝对化用语。"},
  {"id":3,"type":"multi","topic":"消保","stem":"经营者应当履行哪些义务？","options":["A. 保证质量","B. 真实宣传","C. 出具凭证","D. 随意格式条款"],"answer":"ABC","analysis":"不得设定不公平格式条款。"}
]
```

### 方案 2：CSV 文件
列名：`id,type,topic,stem,options,answer,analysis`
- `type`：`single` 单选 / `multi` 多选 / `judge` 判断
- `answer`：字母串，多选连写如 `ABC`，判断用 `A`(正确)/`B`(错误)
- `options`：多选项用 `|` 分隔，例如 `A. 保证质量|B. 真实宣传|C. 出具凭证|D. 随意格式条款`

示例：
```csv
id,type,topic,stem,options,answer,analysis
1,single,药品,处方药销售必须凭什么？,A. 身份证|B. 执业医师处方|C. 会员卡|D. 营业执照,B,处方药须凭执业医师处方销售。
2,judge,广告,广告可以使用'国家级'用语。,A. 正确|B. 错误,B,《广告法》禁用绝对化用语。
```

> Dify 文档提取器会把 CSV 输出成 **Markdown 表格**，上面的 `parse_md_table` 已兼容。

---

## 五、避坑（对照之前踩的）

1. **不要**在代码里用 `urllib` 去下载文件 URL —— 沙箱禁网，必 503。文件上传 + 文档提取器不走网络。
2. **不要**把 `question_file` 直接当对象 `.get('url')` 用 —— 代码节点里它只是个字符串 URL，读不到内容。必须经文档提取器转 `text`。
3. 文档提取器对 CSV 输出的是 **Markdown 表格**（带 `|` 和 `---`），不是标准 CSV，代码里用 `parse_md_table` 兼容。
4. 改完**重开预览（新会话）**再测。
5. 抽题代码**必须保留**原来的 `return` 四个输出键（questions/total/error/first_question），否则下游 `assign1` 接不到。

---

## 六、测试步骤

1. 重开预览（新会话）。
2. 开始节点：`mode=考`、`num=3`，并上传一个 `题库.json`（内容见第四节）。
3. 答 `B` → `B` → `ABC`，最后一题答完直接出成绩单。
4. 确认成绩单里「你的答案」显示的是 `B`/`B`/`ABC`，不是题目 dict。

---

## 七、后续（路线3，可选）

等客户有题库系统 API，把「抽题」节点换成「工具/HTTP 节点」调 API 拉题库即可，状态机一行不用动。
