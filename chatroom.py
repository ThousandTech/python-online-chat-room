import json
import os
from datetime import datetime
from typing import Dict, List, Optional
import timeutils

class ChatRoom:
    """
    聊天室类，管理单个聊天室的所有功能
    """
    def __init__(self, room_id: str, room_name: str, data_dir: str = "data"):
        """
        初始化聊天室
        Args:
            room_id (str): 聊天室ID
            room_name (str): 聊天室名称
            data_dir (str): 数据存储目录
        """
        self.room_id = room_id
        self.room_name = room_name
        self.data_dir = data_dir
        self.messages_file = os.path.join(data_dir, f"messages_{room_id}.json")
        self.active_users = set()  # 当前在线用户
        self.messages = []  # 消息缓存
        self._load_messages()
    
    def _load_messages(self):
        """从文件加载历史消息"""
        if not os.path.exists(self.messages_file):
            self.messages = []
            return
        
        try:
            with open(self.messages_file, 'r', encoding='utf-8') as f:
                self.messages = json.load(f)
        except Exception as e:
            print(f"加载聊天室 {self.room_id} 消息失败: {e}")
            self.messages = []
    
    def _save_messages(self):
        """保存消息到文件"""
        os.makedirs(os.path.dirname(self.messages_file), exist_ok=True)# 创建目录，不存在则创建
        
        try:
            with open(self.messages_file, 'w', encoding='utf-8') as f:
                json.dump(self.messages, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存聊天室 {self.room_id} 消息失败: {e}")
    
    def add_message(self, username: str, message: str) -> dict:
        """
        添加新消息
        Args:
            username (str): 用户名
            message (str): 消息内容
        Returns:
            dict: 完整的消息对象
        """
        timestamp_data = timeutils.get_message_timestamp()
        
        message_obj = {
            'room_id': self.room_id,
            'username': username,
            'msg': message,
            'timestamp': timestamp_data['full'],
            'timestamp_data': timestamp_data
        }
        
        self.messages.append(message_obj)
        self._save_messages()
        return message_obj
    
    def get_messages(self, limit: Optional[int] = 50 ) -> List[dict]:
        """
        获取消息列表
        Args:
            limit (int, optional): 限制返回消息数量
        Returns:
            List[dict]: 消息列表
        """
        if limit:
            return self.messages[-limit:]
        return self.messages.copy()
    
    def add_user(self, username: str):
        """用户加入聊天室"""
        self.active_users.add(username)
        print(f"用户 {username} 加入聊天室 {self.room_name}")
    
    def remove_user(self, username: str):
        """用户离开聊天室"""
        self.active_users.discard(username)
        print(f"用户 {username} 离开聊天室 {self.room_name}")
    
    def get_active_users(self) -> List[str]:
        """获取当前在线用户列表"""
        return list(self.active_users)
    
    def get_user_count(self) -> int:
        """获取当前在线用户数量"""
        return len(self.active_users)
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            'room_id': self.room_id,
            'room_name': self.room_name,
            'user_count': self.get_user_count(),
            'active_users': self.get_active_users(),
            'message_count': len(self.messages)
        }


class ChatRoomManager:
    """
    聊天室管理器，管理多个聊天室
    """
    def __init__(self, data_dir: str = "data/rooms"):
        """
        初始化聊天室管理器
        Args:
            data_dir (str): 数据存储目录
        """
        self.data_dir = data_dir
        self.rooms: Dict[str, ChatRoom] = {}
        self.config_file = os.path.join(data_dir, "rooms_config.json")
        self._load_rooms_config()
        self._create_default_room()
    
    def _load_rooms_config(self):
        """加载聊天室配置"""
        if not os.path.exists(self.config_file):
            return
        
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                for room_data in config.get('rooms', []):
                    room = ChatRoom(
                        room_id=room_data['room_id'],
                        room_name=room_data['room_name'],
                        data_dir=self.data_dir
                    )
                    self.rooms[room_data['room_id']] = room
        except Exception as e:
            print(f"加载聊天室配置失败: {e}")
    
    def _save_rooms_config(self):
        """保存聊天室配置"""
        os.makedirs(os.path.dirname(self.config_file), exist_ok=True)
        
        config = {
            'rooms': [
                {
                    'room_id': room.room_id,
                    'room_name': room.room_name
                }
                for room in self.rooms.values()
            ]
        }
        
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存聊天室配置失败: {e}")
    
    def _create_default_room(self):
        """创建默认聊天室"""
        if not self.rooms:
            default_room = self.create_room("general", "大厅")
            print(f"创建默认聊天室: {default_room.room_name}")
    
    def create_room(self, room_id: str, room_name: str) -> ChatRoom:
        """
        创建新聊天室
        Args:
            room_id (str): 聊天室ID
            room_name (str): 聊天室名称
        Returns:
            ChatRoom: 聊天室对象
        """
        if room_id in self.rooms:
            raise ValueError(f"聊天室 {room_id} 已存在")
        
        room = ChatRoom(room_id, room_name, self.data_dir)
        self.rooms[room_id] = room
        self._save_rooms_config()
        return room
    
    def get_room(self, room_id: str) -> Optional[ChatRoom]:
        """
        获取聊天室
        Args:
            room_id (str): 聊天室ID
        Returns:
            ChatRoom: 聊天室对象，不存在则返回None
        """
        return self.rooms.get(room_id)
    
    def get_all_rooms(self) -> List[ChatRoom]:
        """获取所有聊天室"""
        return list(self.rooms.values())
    
    def delete_room(self, room_id: str) -> bool:
        """
        删除聊天室
        Args:
            room_id (str): 聊天室ID
        Returns:
            bool: 是否删除成功
        """
        if room_id in self.rooms:
            del self.rooms[room_id]
            self._save_rooms_config()
            return True
        return False
    
    def get_default_room(self) -> ChatRoom:
        """获取默认聊天室"""
        if "general" in self.rooms:
            return self.rooms["general"]
        # 如果没有默认聊天室，返回第一个
        if self.rooms:
            return next(iter(self.rooms.values()))
        # 如果没有任何聊天室，创建一个
        return self.create_room("general", "大厅")


# 全局聊天室管理器实例
chat_manager = ChatRoomManager()