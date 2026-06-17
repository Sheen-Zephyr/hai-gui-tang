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
