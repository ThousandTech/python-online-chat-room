import json# 导入json模块解析和保存json
import os# 导入os模块进行文件操作
from werkzeug.security import generate_password_hash, check_password_hash# 导入werkzeug.security模块进行密码加密和校验

USERS_FILE = 'data/users/users.json'# 用户数据文件路径

class User:
    """
    用户类，表示一个聊天系统用户
    """
    def __init__(self, username, password_hash=None, password=None):
        """
        初始化用户对象
        Args:
            username (str): 用户名
            password_hash (str, optional): 已哈希的密码
            password (str, optional): 原始密码，如果提供则会被哈希存储
        """
        self.username = username
        if password_hash:
            self._password_hash = password_hash
        elif password:
            self._password_hash = generate_password_hash(
                password,
                method="scrypt:32768:8:1",
                salt_length=16
            )
        else:
            self._password_hash = None
    
    def check_password(self, password):
        """
        检查密码是否正确
        Args:
            password (str): 待验证的密码
        Returns:
            bool: 密码是否正确
        """
        if self._password_hash:
            return check_password_hash(self._password_hash, password)
        return False
    
    def to_dict(self):
        """
        将用户对象转换为字典，用于JSON序列化
        Returns:
            dict: 用户字典
        """
        return {
            "username": self.username,
            "password_hash": self._password_hash
        }
    
    @classmethod# 类方法，用于从字典创建用户对象
    def from_dict(cls, user_dict):
        """
        从字典创建用户对象
        Args:
            user_dict (dict): 用户字典
        Returns:
            User: 用户对象
        """
        return cls(
            username=user_dict["username"],
            password_hash=user_dict["password_hash"]
        )

class UserManager:
    """
    用户管理器，负责用户的加载、保存、注册和登录
    """
    def __init__(self, users_file=USERS_FILE):
        """
        初始化用户管理器
        Args:
            users_file (str): 用户数据文件路径
        """
        self.users_file = users_file
        self.users = {}  # 用户名 -> User对象
        self._load_users()
    
    def _load_users(self):
        """
        从文件加载用户数据
        """
        if not os.path.exists(self.users_file):
            return
        
        try:
            with open(self.users_file, 'r', encoding='utf-8') as f:
                users_data = json.load(f)
                
            # 将字典格式转换为User对象
            for username, user_data in users_data.items():
                if isinstance(user_data, str):  # 兼容旧格式
                    self.users[username] = User(username, password_hash=user_data)
                else:
                    self.users[username] = User.from_dict(user_data)
        except Exception as e:
            print(f"加载用户数据失败: {e}")
            self.users = {}
    
    def _save_users(self):
        """
        将用户数据保存到文件
        """
        os.makedirs(os.path.dirname(self.users_file), exist_ok=True)
        
        # 转换为新格式
        users_data = {}
        for username, user in self.users.items():
            users_data[username] = user.to_dict()
            
        try:
            with open(self.users_file, 'w', encoding='utf-8') as f:
                json.dump(users_data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            print(f"保存用户数据失败: {e}")
    
    def register_user(self, username, password):
        """
        注册新用户
        Args:
            username (str): 用户名
            password (str): 密码
        Returns:
            tuple: (bool, str)，bool表示注册是否成功，str为提示信息
        """
        if not username or not password:
            return False, "用户名或密码不能为空"
            
        if username in self.users:
            return False, "用户名已存在"
            
        # 创建新用户并保存
        self.users[username] = User(username, password=password)
        self._save_users()
        return True, "注册成功"
    
    def login_user(self, username, password):
        """
        用户登录
        Args:
            username (str): 用户名
            password (str): 密码
        Returns:
            tuple: (bool, str)，bool表示登录是否成功，str为提示信息
        """
        user = self.users.get(username)
        if user and user.check_password(password):
            return True, "登录成功"
        else:
            return False, "用户名或密码错误"
    
    def get_user(self, username):
        """
        获取用户对象
        Args:
            username (str): 用户名
        Returns:
            User: 用户对象，不存在则返回None
        """
        return self.users.get(username)