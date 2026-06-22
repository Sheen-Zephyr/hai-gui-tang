# 上下文压缩 & Bug 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复「第二次提问无回答」bug，新增 prompts.py / config.py 模块拆分，加入滑动窗口上下文压缩。

**Architecture:** config.py 集中常量，prompts.py 独立负责 prompt 构建和上下文压缩，app.py 瘦身为纯路由，app.js 加防抖保护。

**Tech Stack:** Python Flask, pytest, vanilla JS

---

### Task 1: 新增测试

**Files:** Modify `tests/test_api.py`

- [ ] 新增 test_ask_with_history_returns_nonempty_answer（bug 回归测试）
- [ ] 新增 test_ask_rejects_too_long_question（超长输入）
- [ ] 新增 test_ask_story_not_found（404）
- [ ] 新增 test_build_system_prompt_contains_json_instruction
- [ ] 新增 test_build_context_compresses_when_over_limit
- [ ] 新增 test_build_context_no_compress_when_under_limit
- [ ] 新增 test_format_llm_messages_returns_correct_structure
- [ ] 运行 pytest 确认新测试全部失败
- [ ] 提交

### Task 2: 创建 config.py

**Files:** Create `config.py`

- [ ] 集中管理 LLM_MODEL, LLM_TEMPERATURE, LLM_TIMEOUT, LLM_MAX_RETRIES, MAX_QUESTION_LENGTH, MAX_CONTEXT_TURNS, DEFAULT_PORT
- [ ] 提交

### Task 3: 创建 prompts.py

**Files:** Create `prompts.py`

- [ ] 实现 build_system_prompt(story) — 游戏规则 + JSON 格式要求融入 system prompt
- [ ] 实现 build_context(messages, max_turns) — 滑动窗口上下文压缩
- [ ] 实现 format_llm_messages(story, messages, question) — 返回 [system, user] 结构
- [ ] 运行测试确认全部通过
- [ ] 提交

### Task 4: 重构 app.py

**Files:** Modify `app.py`

- [ ] 导入 config.py 和 prompts.py，删除内联常量
- [ ] normalize_answer 增加对 "是的" 的显式处理
- [ ] call_llm 使用指数退避重试 (1s/2s/4s)
- [ ] /api/ask 添加超长问题校验
- [ ] /api/ask 使用 format_llm_messages 构建 prompt
- [ ] 落底正则修正为 [是不否]|无关|是也不是
- [ ] 运行全部测试确认通过
- [ ] 提交

### Task 5: 前端防御改进

**Files:** Modify `static/js/app.js`

- [ ] sendQuestion 增加 300ms 防抖
- [ ] finally 块增加双重 _isSending 保护
- [ ] 提交

### Task 6: 端到端验证

- [ ] 启动服务，curl 测试第一问 → 第二问（带历史）→ 超长输入
- [ ] pytest 全部通过
