from werkzeug.security import generate_password_hash, check_password_hash# 导入werkzeug.security模块进行密码加密和校验

USERS_FILE = 'data/users/users.json'# 用户数据文件路径

from user import User# 导入用户类
from user import UserManager# 导入用户管理类
user_manager = UserManager()

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
    兼容旧接口，用户登录
    Args:
        username (str): 用户名
        password (str): 密码
    Returns:
        tuple: (bool, str)
    """
    return user_manager.login_user(username, password)