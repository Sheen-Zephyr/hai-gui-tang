import json
import os
import re
import time as _time
import logging
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI

from config import (
    LLM_MODEL, LLM_TEMPERATURE, LLM_TIMEOUT, LLM_MAX_RETRIES,
    MAX_QUESTION_LENGTH, DEFAULT_PORT,
)
from prompts import format_llm_messages

load_dotenv()

STORIES_DIR = Path(__file__).parent / "stories"
APP_DIR = Path(__file__).parent

app = Flask(__name__, static_url_path="", static_folder="static")
CORS(app)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(message)s')

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
    stories.sort(key=lambda s: (s.get("id") != "hiccup", s.get("id", "")))
    return stories


STORIES = load_stories()
STORIES_BY_ID = {s["id"]: s for s in STORIES}


def get_available_tags():
    tags = {"type": set(), "horror": set(), "difficulty": set()}
    for s in STORIES:
        t = s.get("tags", {})
        for key in tags:
            if key in t:
                tags[key].add(t[key])
    order_map = {
        "type": ["清汤", "红汤", "创意汤"],
        "horror": ["无恐", "微恐", "中恐", "重恐"],
        "difficulty": ["简单", "中等", "困难"],
    }
    result = {}
    for k in ["type", "horror", "difficulty"]:
        vals = [v for v in order_map.get(k, []) if v in tags.get(k, set())]
        if not vals:
            vals = sorted(tags.get(k, set()))
        result[k] = vals
    return result


def normalize_answer(text):
    text = text.strip()
    if text.startswith("是也不是"):
        return "是也不是"
    if text.startswith("无关"):
        return "无关"
    if text.startswith("是的"):
        return "是"
    if text.startswith("不是"):
        return "否"
    if text.startswith("是"):
        return "是"
    if text.startswith("否"):
        return "否"
    return text


def call_llm(messages, json_mode=False):
    if client is None:
        raise RuntimeError("LLM client is not configured")
    kwargs = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": LLM_TEMPERATURE,
        "timeout": LLM_TIMEOUT,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    for attempt in range(LLM_MAX_RETRIES):
        try:
            resp = client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content
        except Exception as e:
            if attempt < LLM_MAX_RETRIES - 1:
                wait = 2 ** attempt
                _time.sleep(wait)
                continue
            raise


@app.route("/")
def index():
    return send_from_directory(APP_DIR / "static", "index.html")


@app.route("/api/stories")
def list_stories():
    return jsonify(STORIES)


@app.route("/api/tags")
def list_tags():
    return jsonify(get_available_tags())


@app.route("/api/ask", methods=["POST"])
def ask():
    data = request.get_json() or {}
    story_id = data.get("story_id")
    question = (data.get("question") or "").strip()
    messages = data.get("messages") or []

    if not question or not question.strip():
        return jsonify({"error": "question is required"}), 400
    if len(question) > MAX_QUESTION_LENGTH:
        return jsonify({"error": f"question exceeds {MAX_QUESTION_LENGTH} characters"}), 400

    story = STORIES_BY_ID.get(story_id)
    if story is None:
        return jsonify({"error": "story not found"}), 404

    logging.info(f"ASK story={story_id} question='{question[:50]}' messages_count={len(messages)}")

    prompt_messages = format_llm_messages(story, messages, question)

    try:
        raw = call_llm(prompt_messages, json_mode=True)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            answer_match = re.search(r'[是不否]|无关|是也不是', raw)
            if answer_match:
                parsed = {
                    "player_answer": normalize_answer(answer_match.group()),
                    "discovered_clues": [False] * len(story["core_clues"]),
                }
            else:
                parsed = {
                    "player_answer": raw,
                    "discovered_clues": [False] * len(story["core_clues"]),
                }
    except Exception as e:
        logging.error(f"LLM call failed: {e}")
        parsed = {
            "player_answer": "无关",
            "discovered_clues": [False] * len(story["core_clues"]),
        }

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

    prompt_messages = format_llm_messages(story, messages, "")

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
    app.run(debug=False, port=DEFAULT_PORT, threaded=True)
