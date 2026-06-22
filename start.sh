#!/bin/bash
cd /Users/sheen/Documents/海龟汤
echo "正在启动海龟汤服务器..."
export DEEPSEEK_API_KEY=$(grep DEEPSEEK_API_KEY .env | cut -d= -f2)
python3 app.py
