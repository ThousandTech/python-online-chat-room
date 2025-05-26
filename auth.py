import jwt
import datetime
import os

USERS_FILE = 'data/users/users.json'# 用户数据文件路径

from user import User# 导入用户类
from user import UserManager# 导入用户管理类
user_manager = UserManager()

SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your_default_secret_key')
TOKEN_EXPIRATION = 1  # 小时

def load_users():
    """
    兼容旧接口，加载所有用户
    Returns:
        dict: 用户字典
    """
    # 转换为旧格式
    users = {}
    for username, user in user_manager.users.items():
        users[username] = user._password_hash
    return users


def save_users(users):
    """
    兼容旧接口，保存用户数据
    Args:
        users (dict): 用户字典
    """
    # 将旧格式转换为新用户对象
    for username, password_hash in users.items():
        user_manager.users[username] = User(username, password_hash=password_hash)
    user_manager._save_users()

def register_user(username, password):
    """
    兼容旧接口，注册新用户
    Args:
        username (str): 用户名
        password (str): 密码
    Returns:
        tuple: (bool, str)
    """
    return user_manager.register_user(username, password)

def login_user(username, password):
    """
    用户登录，成功时返回JWT token
    Args:
        username (str): 用户名
        password (str): 密码
    Returns:
        tuple: (bool, str, str)
    """
    success, msg = user_manager.login_user(username, password)
    if success:
        # 生成JWT token
        token = generate_token(username)
        return True, msg, token
    return False, msg, None

def generate_token(username):
    """
    生成JWT token
    Args:
        username (str): 用户名
    Returns:
        str: JWT token
    """
    # 设置过期时间
    expiration = datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRATION)
    
    # 创建payload
    payload = {
        'exp': expiration,
        'iat': datetime.datetime.utcnow(),
        'sub': username
    }
    
    # 生成token
    token = jwt.encode(payload, SECRET_KEY, algorithm='HS256')
    # 根据jwt库版本，可能需要解码为字符串
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token

def verify_token(token):
    """
    验证JWT token
    Args:
        token (str): JWT token
    Returns:
        tuple: (bool, str) - (是否有效, 用户名或错误信息)
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
        return True, payload['sub']  # 返回有效状态和用户名
    except jwt.ExpiredSignatureError:
        return False, "Token已过期"
    except jwt.InvalidTokenError:
        return False, "无效的Token"