import pytest
from unittest.mock import patch, MagicMock
from app import app


@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


def test_index(client):
    resp = client.get('/')
    assert resp.status_code == 200
    assert '海龟汤'.encode('utf-8') in resp.data


def test_list_stories(client):
    resp = client.get('/api/stories')
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) >= 1
    assert data[0]['id'] == 'hiccup'


@patch('app.client')
def test_ask_returns_normalized_answer(mock_openai, client):
    mock_openai.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='{"player_answer": "是", "discovered_clues": [true, false, true]}'))]
    )
    resp = client.post('/api/ask', json={
        'story_id': 'hiccup',
        'question': '男人要的是水吗？',
        'messages': [],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data['answer'] == '是'
    assert data['discovered_clues'] == [0, 2]


@patch('app.client')
def test_ask_rejects_empty_question(mock_openai, client):
    resp = client.post('/api/ask', json={
        'story_id': 'hiccup',
        'question': '   ',
        'messages': [],
    })
    assert resp.status_code == 400


@patch('app.client')
def test_check_clues_returns_discovered_indices(mock_openai, client):
    mock_openai.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content='[true, false, true]'))]
    )
    resp = client.post('/api/check-clues', json={
        'story_id': 'hiccup',
        'messages': [
            {'role': 'user', 'content': '男人是不是在打嗝？'},
            {'role': 'assistant', 'content': '是。'},
        ],
    })
    assert resp.status_code == 200
    assert resp.get_json()['discovered_clues'] == [0, 2]


def test_check_clues_story_not_found(client):
    resp = client.post('/api/check-clues', json={
        'story_id': 'not-exist',
        'messages': [],
    })
    assert resp.status_code == 404

# ─── 新增: bug 回归测试 ───

@patch("app.call_llm")
def test_ask_with_history_returns_nonempty_answer(mock_llm, client):
    """第二次提问（带对话历史）必须返回非空答案"""
    mock_llm.return_value = '{"player_answer": "否", "discovered_clues": [false, true, false]}'
    resp = client.post("/api/ask", json={
        "story_id": "hiccup",
        "question": "他要水是为了解渴吗？",
        "messages": [
            {"role": "assistant", "content": "你可以不断向我提问"},
            {"role": "user", "content": "男人当时正在打嗝吗？"},
            {"role": "assistant", "content": "是"},
        ],
    })
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["answer"] != ""
    assert data["answer"] in ("是", "否", "是也不是", "无关")


def test_ask_rejects_too_long_question(client):
    """超过 500 字的问题应该被拒绝"""
    resp = client.post("/api/ask", json={
        "story_id": "hiccup",
        "question": "x" * 501,
        "messages": [],
    })
    assert resp.status_code == 400


def test_ask_story_not_found(client):
    """不存在的 story_id 返回 404"""
    resp = client.post("/api/ask", json={
        "story_id": "ghost",
        "question": "测试问题？",
        "messages": [],
    })
    assert resp.status_code == 404


# ─── 新增: prompts 模块单元测试 ───

def test_build_system_prompt_contains_json_instruction():
    """build_system_prompt 必须包含 JSON 格式指令"""
    from prompts import build_system_prompt
    story = {
        "title": "测试",
        "surface": "汤面内容",
        "answer": "汤底答案",
        "core_clues": ["线索1", "线索2"],
    }
    prompt = build_system_prompt(story)
    assert "JSON" in prompt
    assert "player_answer" in prompt
    assert "discovered_clues" in prompt


def test_build_context_compresses_when_over_limit():
    """超过 max_turns 时，早期轮次被压缩为摘要"""
    from prompts import build_context
    messages = []
    for i in range(10):
        messages.append({"role": "user", "content": f"问题{i}"})
        messages.append({"role": "assistant", "content": "是"})
    result = build_context(messages, max_turns=3)
    assert "早期" in result


def test_build_context_no_compress_when_under_limit():
    """低于限制时不触发压缩"""
    from prompts import build_context
    messages = [
        {"role": "user", "content": "问题1"},
        {"role": "assistant", "content": "是"},
    ]
    result = build_context(messages, max_turns=3)
    assert "早期" not in result
    assert "问题1" in result


def test_format_llm_messages_returns_correct_structure():
    """format_llm_messages 返回 [system, user] 两条消息"""
    from prompts import format_llm_messages
    story = {
        "title": "测试", "surface": "汤面", "answer": "汤底",
        "core_clues": ["线索1"],
    }
    result = format_llm_messages(story, [], "测试问题?")
    assert len(result) == 2
    assert result[0]["role"] == "system"
    assert result[1]["role"] == "user"
    assert "测试问题?" in result[1]["content"]
