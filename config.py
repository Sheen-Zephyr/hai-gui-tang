"""海龟汤应用配置 — 所有硬编码常量集中管理"""

import os

# LLM
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")
LLM_TEMPERATURE = 0.2
LLM_TIMEOUT = 30
LLM_MAX_RETRIES = 3

# 输入校验
MAX_QUESTION_LENGTH = 500

# 上下文压缩: 保留最近 N 轮完整对话，超过的压缩为摘要
MAX_CONTEXT_TURNS = 8

# 应用
DEFAULT_PORT = int(os.getenv("PORT", 8080))
