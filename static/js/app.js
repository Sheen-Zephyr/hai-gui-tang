const API_BASE = '';

let stories = [];
let currentStory = null;
let messages = [];
let discoveredClues = new Set();

const pages = {
  list: document.getElementById('page-list'),
  game: document.getElementById('page-game'),
};

async function init() {
  try {
    const resp = await fetch(`${API_BASE}/api/stories`);
    stories = await resp.json();
    renderStoryList();
  } catch (err) {
    document.getElementById('story-list').innerHTML =
      '<p class="note-status">无法加载案件列表，请检查网络。</p>';
  }
}

function renderStoryList() {
  const container = document.getElementById('story-list');
  container.innerHTML = '';
  stories.forEach((story, index) => {
    const card = document.createElement('div');
    card.className = 'story-card';
    card.dataset.folder = 'FILE ' + String(index + 1).padStart(3, '0');
    card.innerHTML = `<h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.summary)}</p>`;
    card.addEventListener('click', () => startGame(story.id));
    container.appendChild(card);
  });
}

window.startGame = function(storyId) {
  currentStory = stories.find(s => s.id === storyId);
  if (!currentStory) return;
  messages = [];
  discoveredClues = new Set();
  document.getElementById('answer-text').style.display = 'none';
  document.getElementById('answer-text').querySelector('.answer-content').textContent = '';
  renderGame();
  showPage('game');
}

function renderGame() {
  document.getElementById('game-title').textContent = currentStory.title;
  document.getElementById('surface-text').textContent = currentStory.surface;
  renderChat();
  renderClues();
}

function renderChat() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  messages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `message ${msg.role}`;
    div.textContent = msg.content;
    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

function renderClues() {
  const board = document.getElementById('clue-list');
  const status = document.getElementById('clue-status');
  const answerSection = document.getElementById('answer-section');
  board.innerHTML = '';

  if (discoveredClues.size === 0) {
    status.textContent = '调查刚刚开始，软木板上还没有新便签……';
  } else {
    status.textContent = '你在软木板上钉下了这些关键发现：';
    Array.from(discoveredClues).sort().forEach((idx, i) => {
      const clue = document.createElement('div');
      clue.className = 'clue';
      clue.style.setProperty('--r', clueRotation(i));
      clue.textContent = currentStory.core_clues[idx];
      board.appendChild(clue);
    });
  }

  if (discoveredClues.size === currentStory.core_clues.length) {
    answerSection.classList.remove('locked');
    answerSection.innerHTML =
      '<div class="confidential-stamp" aria-hidden="true">CONFIDENTIAL</div>' +
      '<p>所有关键线索都已钉在板上，真相呼之欲出。</p>' +
      '<button id="reveal-answer">揭开汤底</button>';
    document.getElementById('reveal-answer').onclick = revealAnswer;
  } else {
    answerSection.classList.add('locked');
    answerSection.innerHTML =
      '<div class="confidential-stamp" aria-hidden="true">CONFIDENTIAL</div>' +
      '<p>继续追问，更多真相会浮出水面。</p>' +
      '<button disabled>揭开汤底</button>';
  }
}

function clueRotation(index) {
  const rotations = ['-1.5deg', '1deg', '-0.5deg'];
  return rotations[index % rotations.length];
}

async function sendQuestion() {
  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question) return;
  if (question.length > 500) return;
  input.value = '';

  messages.push({ role: 'user', content: question });
  renderChat();
  setLoading(true);

  try {
    const askResp = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story_id: currentStory.id,
        messages: messages.slice(0, -1),
        question,
      }),
    });
    if (!askResp.ok) throw new Error('Ask failed');
    const askData = await askResp.json();
    messages.push({ role: 'assistant', content: askData.answer });
    renderChat();

    if (askData.discovered_clues) {
      askData.discovered_clues.forEach(i => discoveredClues.add(i));
      renderClues();
    }
  } catch (err) {
    messages.push({ role: 'assistant', content: '侦探暂时无法回答，请稍后再试。' });
    renderChat();
  } finally {
    setLoading(false);
  }
}

function revealAnswer() {
  const answerDiv = document.getElementById('answer-text');
  const answerContent = answerDiv.querySelector('.answer-content');
  answerContent.textContent = currentStory.answer;
  answerDiv.style.display = 'block';
  answerDiv.scrollIntoView({ behavior: 'smooth' });
}

function showPage(name) {
  Object.values(pages).forEach(p => (p.style.display = 'none'));
  pages[name].style.display = 'block';
}

function setLoading(loading) {
  document.getElementById('send-btn').disabled = loading;
  document.getElementById('loading').style.display = loading ? 'block' : 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('send-btn').onclick = sendQuestion;
document.getElementById('question-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') sendQuestion();
});
document.getElementById('back-btn').onclick = () => showPage('list');

init();
