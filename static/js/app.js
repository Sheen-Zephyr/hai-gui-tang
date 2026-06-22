/**
 * app.js — 海龟汤主应用逻辑
 * 集成粒子系统、打字机效果、卡片进场动画
 * 新增：本地进度保存、提示系统、游戏统计、时间戳、继续游戏
 */
import { initParticles, destroyParticles } from './particles.js';
import { typewriteText } from './typewriter.js';

const API_BASE = '';

let stories = [];
let currentStory = null;
let messages = [];
let discoveredClues = new Set();
let activeFilters = { type: null, horror: null, difficulty: null };

// 游戏状态
let questionCount = 0;
let hintsUsed = 0;
let gameSolved = false;
let gameGivenUp = false;

// localStorage keys
const LS_PREFIX = 'hgt_';
const LS_PROGRESS = LS_PREFIX + 'progress';
const LS_STATS = LS_PREFIX + 'stats';

const pages = {
  list: document.getElementById('page-list'),
  game: document.getElementById('page-game'),
};

let observer = null;

/* =====================================
   本地存储工具
   ===================================== */
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(LS_PROGRESS)) || {};
  } catch { return {}; }
}

function saveProgress(progress) {
  localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
}

function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(LS_STATS)) || {
      totalQuestions: 0,
      solvedStories: 0,
      totalStoriesPlayed: 0,
      questionCounts: [], // 每个解开的案件的提问次数
    };
  } catch {
    return {
      totalQuestions: 0,
      solvedStories: 0,
      totalStoriesPlayed: 0,
      questionCounts: [],
    };
  }
}

function saveStats(stats) {
  localStorage.setItem(LS_STATS, JSON.stringify(stats));
}

function getStoryProgress(storyId) {
  const all = loadProgress();
  return all[storyId] || null;
}

function setStoryProgress(storyId, data) {
  const all = loadProgress();
  all[storyId] = data;
  saveProgress(all);
}

function clearStoryProgress(storyId) {
  const all = loadProgress();
  delete all[storyId];
  saveProgress(all);
}

/* =====================================
   初始化
   ===================================== */
async function init() {
  const canvas = document.getElementById('particle-canvas');
  if (canvas) initParticles(canvas);

  try {
    const [storyResp, tagResp] = await Promise.all([
      fetch(`${API_BASE}/api/stories`),
      fetch(`${API_BASE}/api/tags`),
    ]);
    stories = await storyResp.json();
    const tagData = await tagResp.json();
    renderFilterBar(tagData);
    renderFeatured();
    renderHowToPlay();
    renderCategoryStats();
    renderStoryList();
    updateStatsPanel();
    setupCardObserver();
  } catch (err) {
    document.getElementById('story-list').innerHTML =
      '<p class="note-status">无法加载案件列表，请检查网络。</p>';
  }
}

/* =====================================
   首页统计面板
   ===================================== */
function updateStatsPanel() {
  const stats = loadStats();
  const progress = loadProgress();
  const solvedCount = Object.values(progress).filter(p => p.solved).length;
  const inProgressCount = Object.values(progress).filter(p => !p.solved).length;

  document.getElementById('stat-total-stories').textContent = stories.length;
  document.getElementById('stat-solved').textContent = solvedCount;
  document.getElementById('stat-in-progress').textContent = inProgressCount;
  document.getElementById('stat-total-questions').textContent = stats.totalQuestions;
}

/* =====================================
   今日推荐
   ===================================== */
function renderFeatured() {
  const container = document.getElementById('featured-list');
  if (!container || stories.length === 0) return;

  // 选择2个故事：优先选择有进度的，然后随机
  const progress = loadProgress();
  const inProgress = stories.filter(s => progress[s.id] && !progress[s.id].solved);
  const solved = stories.filter(s => progress[s.id] && progress[s.id].solved);
  const untouched = stories.filter(s => !progress[s.id]);

  let featured = [];
  if (inProgress.length > 0) featured.push(inProgress[0]);
  if (featured.length < 2 && untouched.length > 0) {
    featured.push(untouched[Math.floor(Math.random() * untouched.length)]);
  }
  if (featured.length < 2 && stories.length > 0) {
    featured.push(stories[Math.floor(Math.random() * stories.length)]);
  }
  featured = featured.slice(0, 2);

  container.innerHTML = '';
  featured.forEach(story => {
    const card = document.createElement('div');
    card.className = 'featured-card';
    const tags = story.tags || {};
    let tagHtml = '<span class="card-tags">';
    if (tags.type) tagHtml += '<span class="card-tag type-' + tags.type + '">' + escapeHtml(tags.type) + '</span>';
    if (tags.horror) tagHtml += '<span class="card-tag horror-' + tags.horror + '">' + escapeHtml(tags.horror) + '</span>';
    if (tags.difficulty) tagHtml += '<span class="card-tag difficulty-' + tags.difficulty + '">' + escapeHtml(tags.difficulty) + '</span>';
    tagHtml += '</span>';

    // 进度标签
    const prog = progress[story.id];
    let badge = '';
    if (prog) {
      if (prog.solved) {
        badge = '<span class="progress-badge solved">已解开</span>';
      } else {
        badge = '<span class="progress-badge in-progress">进行中</span>';
      }
    }

    card.innerHTML = `<h3>${escapeHtml(story.title)}${badge}</h3>${tagHtml}<p>${escapeHtml(story.summary)}</p>`;
    card.addEventListener('click', () => startGame(story.id));
    container.appendChild(card);
  });
}

/* =====================================
   如何玩（已静态写入HTML，此函数保留扩展）
   ===================================== */
function renderHowToPlay() {
  // 静态HTML已包含，无需动态渲染
}

/* =====================================
   案件分类统计
   ===================================== */
function renderCategoryStats() {
  const container = document.getElementById('category-list');
  if (!container || stories.length === 0) return;

  const counts = { type: {}, horror: {}, difficulty: {} };
  stories.forEach(s => {
    const t = s.tags || {};
    if (t.type) counts.type[t.type] = (counts.type[t.type] || 0) + 1;
    if (t.horror) counts.horror[t.horror] = (counts.horror[t.horror] || 0) + 1;
    if (t.difficulty) counts.difficulty[t.difficulty] = (counts.difficulty[t.difficulty] || 0) + 1;
  });

  container.innerHTML = '';

  const typeOrder = ['清汤', '红汤', '创意汤'];
  const horrorOrder = ['无恐', '微恐', '中恐', '重恐'];
  const diffOrder = ['简单', '中等', '困难'];

  typeOrder.forEach(t => {
    if (counts.type[t]) {
      container.innerHTML += `<div class="category-item">${escapeHtml(t)} <span class="category-count">${counts.type[t]}</span></div>`;
    }
  });
  horrorOrder.forEach(t => {
    if (counts.horror[t]) {
      container.innerHTML += `<div class="category-item">${escapeHtml(t)} <span class="category-count">${counts.horror[t]}</span></div>`;
    }
  });
  diffOrder.forEach(t => {
    if (counts.difficulty[t]) {
      container.innerHTML += `<div class="category-item">${escapeHtml(t)} <span class="category-count">${counts.difficulty[t]}</span></div>`;
    }
  });
}

/* =====================================
   筛选栏
   ===================================== */
function renderFilterBar(tagData) {
  const orderMap = {
    type: ["清汤", "红汤", "创意汤"],
    horror: ["无恐", "微恐", "中恐", "重恐"],
    difficulty: ["简单", "中等", "困难"],
  };
  const groups = document.querySelectorAll('.filter-group');
  groups.forEach(group => {
    const key = group.dataset.filter;
    const options = group.querySelector('.filter-options');
    options.innerHTML = '';
    var vals = tagData[key] || [];
    if (orderMap[key]) {
      vals = orderMap[key].filter(v => vals.indexOf(v) !== -1);
    }
    vals.forEach(value => {
      const btn = document.createElement('button');
      btn.className = 'filter-option filter-option-' + key + '-' + value.replace(/[\/\s]/g, '_');
      btn.textContent = value;
      btn.dataset.value = value;
      btn.addEventListener('click', () => {
        const wasActive = btn.classList.contains('active');
        group.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
        if (!wasActive) {
          btn.classList.add('active');
          activeFilters[key] = value;
        } else {
          activeFilters[key] = null;
        }
        renderStoryList();
        setupCardObserver();
      });
      options.appendChild(btn);
    });
  });
  document.getElementById('filter-clear').addEventListener('click', () => {
    document.querySelectorAll('.filter-option').forEach(b => b.classList.remove('active'));
    activeFilters = { type: null, horror: null, difficulty: null };
    renderStoryList();
    setupCardObserver();
  });
}

/* =====================================
   故事列表
   ===================================== */
function renderStoryList() {
  const container = document.getElementById('story-list');
  container.innerHTML = '';
  const hasActiveFilter = activeFilters.type || activeFilters.horror || activeFilters.difficulty;
  const filtered = stories.filter(story => {
    const tags = story.tags || {};
    return (!activeFilters.type || tags.type === activeFilters.type) &&
           (!activeFilters.horror || tags.horror === activeFilters.horror) &&
           (!activeFilters.difficulty || tags.difficulty === activeFilters.difficulty);
  });
  var countEl = document.getElementById('filter-count');
  if (countEl) {
    countEl.textContent = hasActiveFilter ? filtered.length + ' / ' + stories.length + ' 个案件' : '';
  }
  if (filtered.length === 0) {
    container.innerHTML = '<p class="note-status">没有符合条件的案件，试试换个筛选条件。</p>';
    return;
  }

  const progress = loadProgress();

  filtered.forEach((story, index) => {
    const card = document.createElement('div');
    card.className = 'story-card';
    card.dataset.folder = 'FILE ' + String(index + 1).padStart(3, '0');
    const tags = story.tags || {};
    var tagHtml = '<span class="card-tags">';
    if (tags.type) tagHtml += '<span class="card-tag type-' + tags.type + '">' + escapeHtml(tags.type) + '</span>';
    if (tags.horror) tagHtml += '<span class="card-tag horror-' + tags.horror + '">' + escapeHtml(tags.horror) + '</span>';
    if (tags.difficulty) tagHtml += '<span class="card-tag difficulty-' + tags.difficulty + '">' + escapeHtml(tags.difficulty) + '</span>';
    tagHtml += '</span>';

    // 进度标签
    const prog = progress[story.id];
    let badge = '';
    let continueText = '';
    if (prog) {
      if (prog.solved) {
        badge = '<span class="progress-badge solved">已解开</span>';
      } else {
        badge = '<span class="progress-badge in-progress">进行中</span>';
        continueText = '<div style="margin-top:8px;font-family:Courier Prime,monospace;font-size:11px;color:var(--gold);letter-spacing:0.5px;">点击继续调查</div>';
      }
    }

    card.innerHTML = `<h3>${escapeHtml(story.title)}${badge}</h3>${tagHtml}<p>${escapeHtml(story.summary)}</p>${continueText}`;
    card.addEventListener('click', () => startGame(story.id));
    container.appendChild(card);
  });
}

/* =====================================
   卡片进场动画
   ===================================== */
function setupCardObserver() {
  if (observer) observer.disconnect();

  const cards = document.querySelectorAll('.story-card, .featured-card');
  if (cards.length === 0) return;

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const card = entry.target;
        const index = Array.from(cards).indexOf(card);
        setTimeout(() => {
          card.classList.add('visible');
        }, index * 80);
        observer.unobserve(card);
      }
    });
  }, { threshold: 0.1 });

  cards.forEach(card => observer.observe(card));
}

/* =====================================
   开始游戏
   ===================================== */
function startGame(storyId) {
  const story = stories.find(s => s.id === storyId);
  if (!story) return;

  currentStory = story;
  messages = [];
  discoveredClues = new Set();
  questionCount = 0;
  hintsUsed = 0;
  gameSolved = false;
  gameGivenUp = false;

  // 尝试恢复进度
  const saved = getStoryProgress(storyId);
  if (saved && !saved.solved) {
    messages = saved.messages || [];
    discoveredClues = new Set(saved.discoveredClues || []);
    questionCount = saved.questionCount || 0;
    hintsUsed = saved.hintsUsed || 0;
  }

  document.getElementById('game-title').textContent = story.title;
  document.getElementById('surface-text').textContent = story.surface;

  const tags = story.tags || {};
  const tagContainer = document.getElementById('game-tags');
  tagContainer.innerHTML = '';
  ['type', 'horror', 'difficulty'].forEach(key => {
    if (tags[key]) {
      const span = document.createElement('span');
      span.className = 'game-tag game-tag-' + key + '-' + tags[key];
      span.textContent = tags[key];
      tagContainer.appendChild(span);
    }
  });

  // 重置UI
  document.getElementById('answer-text').style.display = 'none';
  document.getElementById('hint-display').style.display = 'none';
  document.getElementById('hint-display').innerHTML = '';
  document.getElementById('question-count').textContent = questionCount;
  document.getElementById('hint-count').textContent = Math.max(0, 3 - hintsUsed);
  document.getElementById('clue-count').textContent = discoveredClues.size + ' / ' + (story.core_clues ? story.core_clues.length : 0);

  updateHintButton();
  renderChat();
  renderClues();

  showPage('game');
}

/* =====================================
   提示系统
   ===================================== */
function updateHintButton() {
  const btn = document.getElementById('hint-btn');
  const status = document.getElementById('hint-status');
  if (!btn || !status) return;

  const remaining = Math.max(0, 3 - hintsUsed);
  const threshold = 10;

  if (gameSolved || gameGivenUp) {
    btn.disabled = true;
    status.textContent = '案件已结案';
    return;
  }

  if (remaining <= 0) {
    btn.disabled = true;
    status.textContent = '提示已用完';
    return;
  }

  if (questionCount >= threshold) {
    btn.disabled = false;
    status.textContent = `还有 ${remaining} 个提示可用（已提问 ${questionCount} 次）`;
  } else {
    btn.disabled = true;
    status.textContent = `提问达到 ${threshold} 次后可使用提示（当前 ${questionCount} 次）`;
  }
}

async function useHint() {
  if (gameSolved || gameGivenUp) return;
  const remaining = Math.max(0, 3 - hintsUsed);
  if (remaining <= 0) return;
  if (questionCount < 10) return;
  if (!currentStory) return;

  const hints = currentStory.hints || [];
  if (hints.length === 0) {
    // 通用提示
    const genericHints = [
      "试着从不同的角度思考问题，不要局限于表面现象。",
      "关注故事中看似矛盾或不合理的地方。",
      "想想每个角色的动机和隐藏信息。",
    ];
    const hintIndex = hintsUsed % genericHints.length;
    showHint(genericHints[hintIndex]);
  } else {
    const hintIndex = hintsUsed % hints.length;
    showHint(hints[hintIndex]);
  }

  hintsUsed++;
  document.getElementById('hint-count').textContent = Math.max(0, 3 - hintsUsed);
  updateHintButton();
  saveCurrentProgress();
}

async function showHint(text) {
  const display = document.getElementById('hint-display');
  display.style.display = 'block';
  display.innerHTML = '';
  await typewriteText(display, text, 35);
}

/* =====================================
   放弃/查看汤底
   ===================================== */
function giveUp() {
  if (!currentStory) return;
  if (gameSolved) return;

  if (!confirm('确定要放弃调查并直接查看汤底吗？')) return;

  gameGivenUp = true;
  revealAnswer();

  // 标记为已放弃（不算解开）
  const progress = loadProgress();
  if (progress[currentStory.id]) {
    progress[currentStory.id].givenUp = true;
    saveProgress(progress);
  }

  updateStatsPanel();
  renderStoryList();
  setupCardObserver();
}

/* =====================================
   聊天渲染
   ===================================== */
function renderChat() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';
  messages.forEach((msg, index) => {
    const div = document.createElement('div');
    div.className = 'message ' + msg.role;

    const content = document.createElement('div');
    content.textContent = msg.content;
    div.appendChild(content);

    // 时间戳
    const ts = document.createElement('div');
    ts.className = 'message-timestamp';
    const time = msg.timestamp ? new Date(msg.timestamp) : new Date();
    ts.textContent = formatTime(time);
    div.appendChild(ts);

    chat.appendChild(div);
  });
  chat.scrollTop = chat.scrollHeight;
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/* =====================================
   线索渲染
   ===================================== */
let _lastClueCount = 0;

function renderClues() {
  const board = document.getElementById('clue-list');
  const status = document.getElementById('clue-status');
  const answerSection = document.getElementById('answer-section');

  document.getElementById('clue-count').textContent = discoveredClues.size + ' / ' + (currentStory && currentStory.core_clues ? currentStory.core_clues.length : 0);

  if (discoveredClues.size === _lastClueCount && board.children.length > 0) {
    if (discoveredClues.size === 0) {
      status.textContent = '调查才刚刚开始，软木板上还没有便签...';
    } else {
      status.textContent = '你在软木板上钉下了这些关键发现：';
    }
    _updateAnswerSection(answerSection);
    return;
  }
  _lastClueCount = discoveredClues.size;
  board.innerHTML = '';

  if (discoveredClues.size === 0) {
    status.textContent = '调查才刚刚开始，软木板上还没有便签...';
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
  _updateAnswerSection(answerSection);
}

function _updateAnswerSection(answerSection) {
  if (gameSolved || gameGivenUp) {
    answerSection.classList.remove('locked');
    answerSection.innerHTML =
      '<div class="confidential-stamp" aria-hidden="true">CONFIDENTIAL</div>' +
      '<p>真相已经大白。</p>' +
      '<button id="reveal-answer" disabled>已揭开</button>';
    return;
  }

  if (discoveredClues.size === (currentStory && currentStory.core_clues ? currentStory.core_clues.length : 0)) {
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

/* =====================================
   保存当前进度
   ===================================== */
function saveCurrentProgress() {
  if (!currentStory) return;
  setStoryProgress(currentStory.id, {
    messages: messages,
    discoveredClues: Array.from(discoveredClues),
    questionCount: questionCount,
    hintsUsed: hintsUsed,
    solved: gameSolved,
    givenUp: gameGivenUp,
    lastPlayed: new Date().toISOString(),
  });
}

/* =====================================
   发送问题
   ===================================== */
let _isSending = false;
let _sendDebounce = null;

async function sendQuestion() {
  if (_isSending) return;
  if (_sendDebounce) return;
  _sendDebounce = setTimeout(() => { _sendDebounce = null; }, 300);

  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question) return;
  if (question.length > 500) return;
  input.value = '';

  messages.push({ role: 'user', content: question, timestamp: new Date().toISOString() });
  questionCount++;
  document.getElementById('question-count').textContent = questionCount;
  updateHintButton();
  renderChat();
  _isSending = true;
  setLoading(true);

  // 更新统计
  const stats = loadStats();
  stats.totalQuestions++;
  saveStats(stats);
  updateStatsPanel();

  try {
    const askResp = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story_id: currentStory.id,
        messages: messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        question,
      }),
    });
    if (!askResp.ok) throw new Error('Ask failed');
    const askData = await askResp.json();
    messages.push({ role: 'assistant', content: askData.answer, timestamp: new Date().toISOString() });
    renderChat();

    if (askData.discovered_clues) {
      askData.discovered_clues.forEach(i => discoveredClues.add(i));
      renderClues();
    }

    saveCurrentProgress();
  } catch (err) {
    messages.push({ role: 'assistant', content: '侦探暂时无法回答，请稍后再试。', timestamp: new Date().toISOString() });
    renderChat();
  } finally {
    _isSending = false;
    if (_sendDebounce) {
      clearTimeout(_sendDebounce);
      _sendDebounce = null;
    }
    setLoading(false);
  }
}

/* =====================================
   揭开汤底
   ===================================== */
function revealAnswer() {
  if (!currentStory) return;

  const answerDiv = document.getElementById('answer-text');
  const answerContent = answerDiv.querySelector('.answer-content');
  answerContent.textContent = currentStory.answer;
  answerDiv.style.display = 'block';
  answerDiv.scrollIntoView({ behavior: 'smooth' });

  if (!gameSolved && !gameGivenUp) {
    gameSolved = true;

    // 更新统计
    const stats = loadStats();
    stats.solvedStories++;
    stats.questionCounts.push(questionCount);
    saveStats(stats);

    // 保存进度
    saveCurrentProgress();

    updateStatsPanel();
    renderStoryList();
    setupCardObserver();
  }

  _updateAnswerSection(document.getElementById('answer-section'));
}

/* =====================================
   页面切换
   ===================================== */
function showPage(name) {
  const transition = document.getElementById('page-transition');

  // 淡出当前页面
  if (transition) {
    transition.classList.add('active');
    setTimeout(() => {
      Object.values(pages).forEach(p => (p.style.display = 'none'));
      pages[name].style.display = 'block';
      transition.classList.remove('active');
      window.scrollTo(0, 0);
    }, 250);
  } else {
    Object.values(pages).forEach(p => (p.style.display = 'none'));
    pages[name].style.display = 'block';
    window.scrollTo(0, 0);
  }
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

/* =====================================
   DOM 事件绑定
   ===================================== */
document.addEventListener("DOMContentLoaded", function() {
  init();

  document.getElementById('back-btn').addEventListener('click', function() {
    showPage('list');
  });

  document.getElementById('send-btn').addEventListener('click', sendQuestion);

  document.getElementById('question-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  });

  document.getElementById('hint-btn').addEventListener('click', useHint);

  const giveUpBtn = document.getElementById('give-up-btn');
  if (giveUpBtn) {
    giveUpBtn.addEventListener('click', giveUp);
  }
});
