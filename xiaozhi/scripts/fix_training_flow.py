import yaml
from pathlib import Path

src = Path(r"E:\xiaozhi-Requirement\training-flow.fixed.yml")
dst = Path(r"E:\xiaozhi-Requirement\training-flow.fixed.v2.yml")

data = yaml.safe_load(src.read_text(encoding="utf-8"))
nodes = {n["id"]: n for n in data["workflow"]["graph"]["nodes"]}

# 1. 修复判分节点的 answers 输入绑定
grade_id = "1785479852111"
grade_node = nodes[grade_id]
for var in grade_node["data"]["variables"]:
    if var["variable"] == "answers":
        var["value_selector"] = ["conversation", "answers"]
        var["value_type"] = "array[string]"
        print(f"Fixed {grade_id} answers binding -> conversation.answers")

# 2. 清理收答案代码：去掉重复 main，类型显示中文
submit_id = "1785469906563"
submit_code = '''def main(answers, user_answer, questions, current, total) -> dict:
    type_map = {"single": "单选", "multi": "多选", "judge": "判断"}
    ans = list(answers or [])
    ans.append((user_answer or "").strip())
    cur = int(current or 0) + 1
    has_next = cur < len(questions or [])
    q = ""
    if has_next:
        it = questions[cur]
        t = type_map.get(it.get("type", ""), it.get("type", ""))
        q = f"第 {cur+1} 题（{t}）：{it.get('stem','')}\n" + "\n".join(it.get("options") or [])
    return {"answers": ans, "current": cur, "next_question": q, "has_next": has_next}
'''
nodes[submit_id]["data"]["code"] = submit_code
print(f"Cleaned {submit_id} code")

# 3. 优化判分代码输出格式
grade_code = '''def main(questions, answers) -> dict:
    type_map = {"single": "单选", "multi": "多选", "judge": "判断"}
    qs, ans = questions or [], answers or []
    score, lines = 0, []
    for i, q in enumerate(qs):
        user = (ans[i] if i < len(ans) else "(未答)").strip()
        correct = str(q.get("answer", "")).strip()
        ok = (user == correct)
        if ok:
            score += 1
        t = type_map.get(q.get("type", ""), q.get("type", ""))
        lines.append(
            f"【第 {i+1} 题 · {t}】{q.get('stem','')}\n"
            f"  你的答案：{user}　|　正确答案：{correct}　|　{'正确' if ok else '错误'}\n"
            f"  解析：{q.get('analysis','')}"
        )
    total = len(qs)
    pct = round(score / total * 100) if total else 0
    status = "恭喜及格！" if score >= total * 0.6 else "继续加油～"
    head = f"考试结束\\n得分：{score}/{total}（{pct} 分）\\n{status}\\n\\n"
    return {"report": head + "\\n\\n".join(lines)}
'''
nodes[grade_id]["data"]["code"] = grade_code
print(f"Optimized {grade_id} report format")

# 4. 优化抽题代码中首题/下一题的类型显示
extract_id = "1785467424265"
extract_code = '''import random

def main(num) -> dict:
    type_map = {"single": "单选", "multi": "多选", "judge": "判断"}
    questions = [
        {"id": 1, "type": "single", "topic": "药品监管",
         "stem": "非药品（如保健食品）在广告中不得涉及下列哪项内容？",
         "options": ["A. 产品名称", "B. 疾病预防、治疗功能", "C. 适用人群", "D. 生产厂家"],
         "answer": "B",
         "analysis": "《广告法》及《药品管理法》均规定，非药品不得宣传疾病预防、治疗功能。"},
        {"id": 2, "type": "single", "topic": "食品安全",
         "stem": "食品经营者未取得食品经营许可证从事食品经营活动，监管部门应首先如何处理？",
         "options": ["A. 直接吊销营业执照", "B. 责令停止经营，没收违法所得", "C. 罚款 100 万元", "D. 责令登报道歉"],
         "answer": "B",
         "analysis": "《食品安全法》第一百二十二条：未取得许可从事食品生产经营，责令停止违法行为，没收违法所得。"},
        {"id": 3, "type": "judge", "topic": "消费者权益",
         "stem": "经营者采用网络、电视、电话、邮购等方式销售商品，消费者有权自收到商品之日起七日内退货，且无需说明理由。",
         "options": ["A. 正确", "B. 错误"],
         "answer": "A",
         "analysis": "《消费者权益保护法》第二十五条规定了七日无理由退货制度。"},
        {"id": 4, "type": "multi", "topic": "广告法",
         "stem": "下列哪些属于广告中禁止使用的绝对化用语？",
         "options": ["A. 国家级", "B. 最高级", "C. 最佳", "D. 质优"],
         "answer": "ABC",
         "analysis": "《广告法》第九条禁止广告中使用国家级、最高级、最佳等用语。"},
        {"id": 5, "type": "judge", "topic": "药品监管",
         "stem": "药品零售企业销售处方药，必须凭执业医师或执业助理医师处方方可销售。",
         "options": ["A. 正确", "B. 错误"],
         "answer": "A",
         "analysis": "《药品管理法》第五十八条规定，药品零售企业应当凭处方销售处方药。"},
        {"id": 6, "type": "single", "topic": "价格监管",
         "stem": "经营者销售商品和提供服务时，应当按照政府价格主管部门的规定明码标价，注明商品的哪些内容？",
         "options": ["A. 品名、产地、规格、等级、计价单位、价格", "B. 仅品名和价格", "C. 仅价格和产地", "D. 仅品名、规格、价格"],
         "answer": "A",
         "analysis": "《价格法》第十三条及《关于商品和服务实行明码标价的规定》要求注明品名、产地、规格、等级、计价单位、价格等。"},
        {"id": 7, "type": "multi", "topic": "消费者权益",
         "stem": "经营者向消费者提供商品或者服务时，应当履行哪些义务？",
         "options": ["A. 保证商品和服务质量", "B. 不得作虚假或引人误解的宣传", "C. 提供购货凭证或服务单据", "D. 可以随意设定不公平格式条款"],
         "answer": "ABC",
         "analysis": "《消费者权益保护法》规定经营者应保证质量、真实宣传、出具凭证，不得设定不公平格式条款。"},
        {"id": 8, "type": "judge", "topic": "计量监管",
         "stem": "商家使用不合格计量器具或者破坏计量器具准确度，给消费者造成损失的，应当赔偿损失。",
         "options": ["A. 正确", "B. 错误"],
         "answer": "A",
         "analysis": "《计量法》第二十七条规定，使用不合格计量器具或破坏准确度，给国家和消费者造成损失的，责令赔偿损失。"}
    ]
    n = max(1, min(int(num or 5), len(questions)))
    picked = random.sample(questions, n)
    for i, q in enumerate(picked):
        q["index"] = i + 1
    first = picked[0]
    t = type_map.get(first.get("type", ""), first.get("type", ""))
    fq = f"第 1 题（{t}）：{first.get('stem', '')}\n" + "\n".join(first.get("options") or [])
    return {"questions": picked, "total": n, "error": "", "first_question": fq}
'''
nodes[extract_id]["data"]["code"] = extract_code
print(f"Optimized {extract_id} question type display")

# 验证
edges = data["workflow"]["graph"]["edges"]
print(f"Nodes: {len(data['workflow']['graph']['nodes'])}, Edges: {len(edges)}")

# 检查是否有 dangling edges
node_ids = set(nodes.keys())
sources = {e.get("source") for e in edges}
targets = {e.get("target") for e in edges}
dangling = (sources | targets) - node_ids
if dangling:
    print(f"WARNING dangling edges: {dangling}")
else:
    print("No dangling edges")

# 写回
yaml_str = yaml.dump(data, allow_unicode=True, sort_keys=False, width=4096)
dst.write_text(yaml_str, encoding="utf-8")
print(f"Saved to {dst}")
