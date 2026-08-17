#!/usr/bin/env python3
"""Generate Dify 0.5.0 compatible Chatflow DSL (Phase B simplified)."""
from __future__ import annotations

import textwrap
import uuid
from pathlib import Path

START = "2000000000001"
IF_SCENE = "2000000000002"
IF_ASPECT = "2000000000003"

CASE_PHARMACY = "2000000000101"
CASE_CORRIDOR = "2000000000102"
CASE_DRUG = "2000000000201"
CASE_DEVICE = "2000000000202"

KR = {
    "welcome": "2000000000010",
    "pharmacy": "2000000000011",
    "cosmetic": "2000000000012",
    "drug": "2000000000013",
    "device": "2000000000014",
    "corridor_all": "2000000000015",
}

LLM = {
    "welcome": "2000000000020",
    "pharmacy": "2000000000021",
    "cosmetic": "2000000000022",
    "drug": "2000000000023",
    "device": "2000000000024",
    "corridor_all": "2000000000025",
}

ANS = {
    "welcome": "2000000000030",
    "pharmacy": "2000000000031",
    "cosmetic": "2000000000032",
    "drug": "2000000000033",
    "device": "2000000000034",
    "corridor_all": "2000000000035",
}

DATASET = {
    "welcome": "REPLACE-KB-WELCOME",
    "pharmacy": "REPLACE-KB-PHARMACY",
    "cosmetic": "REPLACE-KB-COSMETIC",
    "drug": "REPLACE-KB-DRUG",
    "device": "REPLACE-KB-DEVICE",
}

LLM_PROMPT = textwrap.dedent(
    f"""\
    你是「云安市场监管普法助手」安安，面向展厅参观者口头解答法规问题。

    【位置上下文】
    - 场景 scene = {{{{#2000000000001.scene#}}}}
      welcome=迎宾大厅 | corridor=宣传廊 | pharmacy=模拟药店
    - 专区 aspect = {{{{#2000000000001.aspect#}}}}\
      cosmetic=化妆区 | drug=药品区 | device=器械专区 | 空=宣传廊总览
    - 篇章 chapter = {{{{#2000000000001.chapter#}}}}\
      science=科普篇 | law=法规篇 | case1/case2/casePick=案例篇 | 空=未指定篇章

    【篇章优先规则】
    - chapter=science：优先采用检索结果中「科普篇」相关内容
    - chapter=law：优先「法规篇」
    - chapter 为 case1/case2/casePick：优先「案例篇」
    - chapter 为空：综合最相关部分

    【任务】
    1. 仅依据下方检索上下文回答，须注明《XX法/条例》第X条。
    2. 无相关内容时答：「我暂时无法找到相关法规条文，请咨询现场工作人员。」
    3. 不要编造法条；不要教用户导航或点按钮；不要 Markdown。

    【输出】口语化短句，2～4 句，150～280 字，适合语音朗读。

    【检索上下文】
    {{{{#context#}}}}"""
)


def uid() -> str:
    return str(uuid.uuid4())


def edge(eid: str, src: str, tgt: str, sh: str, st: str, tt: str) -> str:
    return f"""    - data:
        isInIteration: false
        isInLoop: false
        sourceType: {st}
        targetType: {tt}
      id: {eid}
      source: '{src}'
      sourceHandle: '{sh}'
      target: '{tgt}'
      targetHandle: target
      type: custom
      zIndex: 0"""


def if_case(case_id: str, var: str, value: str) -> str:
    cid = uid()
    return f"""        - case_id: '{case_id}'
          conditions:
          - comparison_operator: is
            id: {cid}
            value: {value}
            varType: string
            variable_selector:
            - '{START}'
            - {var}
          id: '{case_id}'
          logical_operator: and"""


def kr_data(key: str, title: str, top_k: int = 4, multi_ids: list[str] | None = None) -> str:
    if multi_ids is None:
        ids = [DATASET[key]]
    else:
        ids = multi_ids
    ids_yaml = "\n".join(f"        - {i}" for i in ids)
    return f"""        dataset_ids:
{ids_yaml}
        multiple_retrieval_config:
          reranking_enable: false
          top_k: {top_k}
        query_attachment_selector: []
        query_variable_selector:
        - '{START}'
        - sys.query
        retrieval_mode: multiple
        selected: false
        title: {title}
        type: knowledge-retrieval"""


def llm_data(key: str) -> str:
    return f"""        context:
          enabled: true
          variable_selector:
          - '{KR[key]}'
          - result
        memory:
          query_prompt_template: '{{{{#sys.query#}}}}'
          role_prefix:
            assistant: ''
            user: ''
          window:
            enabled: false
            size: 10
        model:
          completion_params:
            max_tokens: 1024
            temperature: 0.2
          mode: chat
          name: deepseek-v3
          provider: langgenius/tongyi/tongyi
        prompt_template:
        - id: {uid()}
          role: system
          text: |
{textwrap.indent(LLM_PROMPT, "            ")}
        selected: false
        title: LLM-{key}
        type: llm
        vision:
          enabled: false"""


def node_block(data: str, nid: str, x: int, y: int, h: int = 90, w: int = 242) -> str:
    return f"""    - data:
{data}
      height: {h}
      id: '{nid}'
      position:
        x: {x}
        y: {y}
      positionAbsolute:
        x: {x}
        y: {y}
      selected: false
      sourcePosition: right
      targetPosition: left
      type: custom
      width: {w}"""


def main() -> None:
    edges = [
        edge(f"{START}-source-{IF_SCENE}-target", START, IF_SCENE, "source", "start", "if-else"),
        edge(f"{IF_SCENE}-true-{KR['welcome']}-target", IF_SCENE, KR["welcome"], "true", "if-else", "knowledge-retrieval"),
        edge(f"{IF_SCENE}-{CASE_PHARMACY}-{KR['pharmacy']}-target", IF_SCENE, KR["pharmacy"], CASE_PHARMACY, "if-else", "knowledge-retrieval"),
        edge(f"{IF_SCENE}-{CASE_CORRIDOR}-{IF_ASPECT}-target", IF_SCENE, IF_ASPECT, CASE_CORRIDOR, "if-else", "if-else"),
        edge(f"{IF_ASPECT}-true-{KR['cosmetic']}-target", IF_ASPECT, KR["cosmetic"], "true", "if-else", "knowledge-retrieval"),
        edge(f"{IF_ASPECT}-{CASE_DRUG}-{KR['drug']}-target", IF_ASPECT, KR["drug"], CASE_DRUG, "if-else", "knowledge-retrieval"),
        edge(f"{IF_ASPECT}-{CASE_DEVICE}-{KR['device']}-target", IF_ASPECT, KR["device"], CASE_DEVICE, "if-else", "knowledge-retrieval"),
        edge(f"{IF_ASPECT}-false-{KR['corridor_all']}-target", IF_ASPECT, KR["corridor_all"], "false", "if-else", "knowledge-retrieval"),
    ]
    for k in KR:
        edges.append(edge(f"{KR[k]}-source-{LLM[k]}-target", KR[k], LLM[k], "source", "knowledge-retrieval", "llm"))
        edges.append(edge(f"{LLM[k]}-source-{ANS[k]}-target", LLM[k], ANS[k], "source", "llm", "answer"))

    start_data = """        title: 开始
        type: start
        variables:
        - default: welcome
          hint: ''
          label: scene
          max_length: 48
          options:
          - welcome
          - corridor
          - pharmacy
          placeholder: ''
          required: true
          type: select
          variable: scene
        - default: ''
          hint: ''
          label: aspect
          max_length: 48
          options:
          - ''
          - cosmetic
          - drug
          - device
          placeholder: ''
          required: false
          type: select
          variable: aspect
        - default: ''
          hint: ''
          label: chapter
          max_length: 48
          options:
          - ''
          - science
          - law
          - casePick
          - case1
          - case2
          placeholder: ''
          required: false
          type: select
          variable: chapter"""

    if_scene_data = f"""        cases:
{if_case('true', 'scene', 'welcome')}
{if_case(CASE_PHARMACY, 'scene', 'pharmacy')}
{if_case(CASE_CORRIDOR, 'scene', 'corridor')}
        selected: false
        title: 按 scene 分流
        type: if-else"""

    if_aspect_data = f"""        cases:
{if_case('true', 'aspect', 'cosmetic')}
{if_case(CASE_DRUG, 'aspect', 'drug')}
{if_case(CASE_DEVICE, 'aspect', 'device')}
        selected: false
        title: 宣传廊按 aspect 选库
        type: if-else"""

    nodes = [
        node_block(start_data, START, 80, 320, h=160),
        node_block(if_scene_data, IF_SCENE, 320, 320, h=171),
        node_block(if_aspect_data, IF_ASPECT, 520, 480, h=171),
        node_block(kr_data("welcome", "检索-序厅"), KR["welcome"], 420, 40),
        node_block(kr_data("pharmacy", "检索-模拟药店"), KR["pharmacy"], 420, 160),
        node_block(kr_data("cosmetic", "检索-化妆品区"), KR["cosmetic"], 740, 280),
        node_block(kr_data("drug", "检索-药品区"), KR["drug"], 740, 400),
        node_block(kr_data("device", "检索-器械区"), KR["device"], 740, 520),
        node_block(
            kr_data(
                "corridor_all",
                "检索-宣传廊三库",
                top_k=6,
                multi_ids=[DATASET["cosmetic"], DATASET["drug"], DATASET["device"]],
            ),
            KR["corridor_all"],
            740,
            640,
        ),
    ]
    for i, k in enumerate(KR):
        nodes.append(node_block(llm_data(k), LLM[k], 1060, 40 + i * 110, h=87))
        ans_data = f"""        answer: '{{{{#{LLM[k]}.text#}}}}'
        selected: false
        title: 回复-{k}
        type: answer
        variables: []"""
        nodes.append(node_block(ans_data, ANS[k], 1360, 40 + i * 110, h=102))

    yml = f"""app:
  description: 大屏问答 scene/aspect/chapter 路由 + 分区知识库 RAG
  icon: ⚖️
  icon_background: '#E4F0FF'
  mode: advanced-chat
  name: 云安区市场监管普法助手-阶段B
  use_icon_as_answer_icon: false
dependencies:
- current_identifier: null
  type: marketplace
  value:
    marketplace_plugin_unique_identifier: langgenius/tongyi:0.0.56@42a5fb7bc09b2f14f9d19f0ac79bec42c3c50dba07a52bf1b6d3abcd6906c739
    version: null
kind: app
version: 0.5.0
workflow:
  conversation_variables: []
  environment_variables: []
  features:
    file_upload:
      allowed_file_extensions:
      - .JPG
      - .JPEG
      - .PNG
      - .GIF
      - .WEBP
      - .SVG
      allowed_file_types:
      - image
      allowed_file_upload_methods:
      - local_file
      - remote_url
      enabled: false
      number_limits: 3
    opening_statement: ''
    retriever_resource:
      enabled: true
    sensitive_word_avoidance:
      enabled: false
    speech_to_text:
      enabled: false
    suggested_questions: []
    suggested_questions_after_answer:
      enabled: false
    text_to_speech:
      enabled: false
      language: ''
      voice: ''
  graph:
    edges:
{chr(10).join(edges)}
    nodes:
{chr(10).join(nodes)}
    viewport:
      x: 0
      y: 0
      zoom: 0.55
"""
    out = Path(__file__).resolve().parents[1] / "workflows" / "普法助手-阶段B.yml"
    out.write_text(yml, encoding="utf-8")
    print(f"Wrote {out} (Dify DSL 0.5.0, no fallback)")


if __name__ == "__main__":
    main()
