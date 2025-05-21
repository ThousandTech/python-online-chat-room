import json
import os

MESSAGES_FILE = 'data/messages.json'

def load_messages():
    """
    此函数读取所有历史消息，返回消息列表。
    Returns:
        list: 聊天消息字典列表
    """
    if not os.path.exists(MESSAGES_FILE):# 消息文件不存在，返回空列表
        return []
    with open(MESSAGES_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)# 返回消息列表

def save_message(message):
    """
    此函数保存单条消息到本地消息文件。
    Args:
        message (dict): 单条消息，包含username, msg, timestamp等
    """
    msgs = load_messages()# 先加载历史消息到内存
    msgs.append(message)# 追加消息
    with open(MESSAGES_FILE, 'w', encoding='utf-8') as f:
        json.dump(msgs, f, ensure_ascii=False, indent=2)# 写入文件，自动格式化
