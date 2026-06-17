import json
import os
import re
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

STORIES_DIR = Path(__file__).parent / "stories"
APP_DIR = Path(__file__).parent

app = Flask(__name__, static_url_path="", static_folder="static")
CORS(app)

api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
base_url = os.getenv("OPENAI_BASE_URL") or os.getenv("DEEPSEEK_BASE_URL")
if api_key:
    client = OpenAI(api_key=api_key, base_url=base_url)
else:
    client = None
if api_key and not base_url and os.getenv("DEEPSEEK_API_KEY"):
    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

def load_stories():
    stories = []
    for path in sorted(STORIES_DIR.glob("*.json")):
        try:
            with open(path, "r", encoding="utf-8") as f:
                stories.append(json.load(f))
        except (json.JSONDecodeError, OSError):
            continue
    # 保持原始示例故事 hiccup 在第一位，其余按文件名排序
    stories.sort(key=lambda s: (s.get("id") != "hiccup", s.get("id", "")))
    return stories


STORIES = load_stories()
STORIES_BY_ID = {s["id"]: s for s in STORIES}


@app.route("/")
def index():
    return send_from_directory(APP_DIR / "static", "index.html")


@app.route("/api/stories")
def list_stories():
    return jsonify(STORIES)


def normalize_answer(text):
    text = text.strip()
    if text.startswith("是也不是"):
        return "是也不是"
    if text.startswith("无关"):
        return "无关"
    if text.startswith("是"):
        return "是"
    if text.startswith("否") or text.startswith("不是"):
        return "否"
    return text


def build_system_prompt(story):
    return (
        "你是一名海龟汤游戏的裁判。根据以下案件的汤面和汤底，回答玩家的提问。\n\n"
        f"案件标题：{story['title']}\n"
        f"汤面：{story['surface']}\n"
        f"汤底：{story['answer']}\n\n"
        "规则：\n"
        "1. 你只能回答「是」「否」「是也不是」「无关」这四种之一。\n"
        "2. 如果玩家的问题本身不成立、前提错误，或无法简单用是/否回答，回答「无关」。\n"
        "3. 如果问题的结论部分正确、部分错误，回答「是也不是」。\n"
        "4. 不要直接透露汤底，只通过回答引导玩家推理。\n"
        "请用简短的一句话给出答案，不要解释。"
    )


def call_llm(messages, json_mode=False):
    if client is None:
        raise RuntimeError("LLM client is not configured")
    kwargs = {
        "model": os.getenv("LLM_MODEL", "deepseek-chat"),
        "messages": messages,
        "temperature": 0.2,
        "timeout": 60,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content


@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json() or {}
    story_id = data.get("story_id")
    question = (data.get("question") or "").strip()
    messages = data.get("messages") or []

    if not question:
        return jsonify({"error": "question is required"}), 400

    story = STORIES_BY_ID.get(story_id)
    if story is None:
        return jsonify({"error": "story not found"}), 404

    prompt_messages = [
        {"role": "system", "content": build_system_prompt(story)},
        *messages,
        {"role": "user", "content": question},
    ]

    schema_hint = (
        "请用 JSON 格式返回，字段如下：\n"
        "{\n"
        '  "player_answer": "是/否/是也不是/无关 之一",\n'
        '  "discovered_clues": [true/false, ...]  // 数组长度等于核心线索数量，表示每条线索是否已被玩家发现\n'
        "}\n"
        f"核心线索共 {len(story['core_clues'])} 条：\n"
        + "\n".join(f"{i}. {c}" for i, c in enumerate(story["core_clues"]))
    )
    prompt_messages.append({"role": "system", "content": schema_hint})

    raw = call_llm(prompt_messages, json_mode=True)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"player_answer": raw, "discovered_clues": [False] * len(story["core_clues"])}

    answer = normalize_answer(parsed.get("player_answer", ""))
    discovered = parsed.get("discovered_clues") or []
    discovered = [
        i for i, flag in enumerate(discovered[: len(story["core_clues"])]) if flag
    ]

    return jsonify({"answer": answer, "discovered_clues": discovered})


@app.route("/api/check-clues", methods=["POST"])
def check_clues():
    data = request.get_json() or {}
    story_id = data.get("story_id")
    messages = data.get("messages") or []

    story = STORIES_BY_ID.get(story_id)
    if story is None:
        return jsonify({"error": "story not found"}), 404

    prompt_messages = [
        {"role": "system", "content": build_system_prompt(story)},
        *messages,
    ]

    schema_hint = (
        "请根据以上对话，判断玩家是否已经发现每条核心线索。\n"
        "用 JSON 数组返回，长度为 "
        f"{len(story['core_clues'])}"
        "，每个元素是 true 或 false，表示对应线索是否已被玩家发现。\n"
        "只返回数组本身，例如：[true, false, true]"
    )
    prompt_messages.append({"role": "system", "content": schema_hint})

    raw = call_llm(prompt_messages, json_mode=True)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict) and "discovered_clues" in parsed:
            discovered = parsed["discovered_clues"]
        else:
            discovered = parsed
        if not isinstance(discovered, list):
            discovered = []
    except json.JSONDecodeError:
        discovered = []

    discovered = [
        i for i, flag in enumerate(discovered[: len(story["core_clues"])]) if flag
    ]
    return jsonify({"discovered_clues": discovered})


if __name__ == "__main__":
    app.run(debug=False, port=int(os.getenv("PORT", 5000)))
