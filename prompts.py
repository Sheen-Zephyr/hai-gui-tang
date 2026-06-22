"""Prompt 构建与上下文压缩模块"""

from config import MAX_CONTEXT_TURNS


def build_system_prompt(story):
    """构建系统提示，包含游戏规则和 JSON 格式要求"""
    clues_text = "\n".join(
        f"{i}. {c}" for i, c in enumerate(story["core_clues"])
    )
    return (
        "你是一名海龟汤游戏的裁判。根据以下案件的汤面和汤底，回答玩家的提问。\n\n"
        f"案件标题：{story['title']}\n"
        f"汤面：{story['surface']}\n"
        f"汤底：{story['answer']}\n\n"
        "规则：\n"
        "1. 你只能回答「是」「否」「是也不是」「无关」这四种之一。\n"
        "2. 如果玩家的问题本身不成立、前提错误，或无法简单用是/否回答，回答「无关」。\n"
        "3. 如果问题的结论部分正确、部分错误，回答「是也不是」。\n"
        "4. 不要直接透露汤底，只通过回答引导玩家推理。\n\n"
        f"核心线索共 {len(story['core_clues'])} 条：\n{clues_text}\n\n"
        "请始终以 JSON 格式回复，不要附带任何解释文字：\n"
        '{"player_answer": "是/否/是也不是/无关", '
        '"discovered_clues": [true, false, ...]  // 每个核心线索对应一个布尔值\n'
        "}"
    )


def build_context(messages, max_turns=None):
    """将对话历史压缩为文本块。
    保持最近 max_turns 轮的完整对话，更早的压缩为摘要列表。
    返回格式统一的纯文本字符串，不再使用角色链。
    """
    if max_turns is None:
        max_turns = MAX_CONTEXT_TURNS

    if not messages:
        return ""

    max_messages = max_turns * 2  # 每轮 = 一问一答

    if len(messages) <= max_messages:
        lines = []
        for msg in messages:
            if msg["role"] == "user":
                lines.append(f"玩家：{msg['content']}")
            else:
                lines.append(f"裁判：{msg['content']}")
        return "\n".join(lines) + "\n"

    # 超过限制：拆分早期和近期
    early = messages[:-max_messages]
    recent = messages[-max_messages:]

    summary_pairs = []
    for i in range(0, len(early), 2):
        q = early[i]["content"] if i < len(early) else "？"
        a = early[i + 1]["content"] if i + 1 < len(early) else "—"
        summary_pairs.append(f"- 玩家问「{q}」→ 裁判答「{a}」")

    summary = (
        f"【早期对话摘要 — 共 {len(summary_pairs)} 条早期记录已压缩】\n"
        + "\n".join(summary_pairs)
    )

    recent_lines = []
    for msg in recent:
        if msg["role"] == "user":
            recent_lines.append(f"玩家：{msg['content']}")
        else:
            recent_lines.append(f"裁判：{msg['content']}")

    return summary + "\n\n【最近对话】\n" + "\n".join(recent_lines) + "\n"


def format_llm_messages(story, messages, question):
    """构建发给 LLM 的完整消息列表。
    返回固定结构: [system_message, user_message]
    不再使用连续的角色链 — 这是修复的核心。
    """
    system_prompt = build_system_prompt(story)
    context = build_context(messages)

    user_message = (
        f"对话记录：\n{context}\n"
        f"玩家当前提问：{question}\n\n"
        "请以 JSON 格式回答。"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
