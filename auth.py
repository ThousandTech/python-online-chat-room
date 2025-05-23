import json# 导入json模块解析和保存json
import os# 导入os模块进行文件操作
from werkzeug.security import generate_password_hash, check_password_hash# 导入werkzeug.security模块进行密码加密和校验

USERS_FILE = 'data/users.json'# 用户数据文件路径

def load_users():
    """
    此函数读取用户数据文件，返回所有用户名和密码的字典。
    \n如果文件不存在则返回空字典。
    Returns:
        users (dict): 用户名-密码字典
    """
    if not os.path.exists(USERS_FILE):# users.json文件不存在
        return {}
    with open(USERS_FILE, 'r') as f:# 只读打开users.json
        return json.load(f)

def save_users(users):
    """
    此函数将用户数据写入本地JSON文件。
    \n若文件不存在则自动新建。
    Args:
        users (dict): 用户名-密码字典
    """
    with open(USERS_FILE, 'w') as f:# 写入打开users.json，不存在则自动新建
        json.dump(users, f, ensure_ascii=False, indent=4)# 调用json.dump()方法将users.json写入user字典中的所有用户账号和密码

def register_user(username, password):
    """
    此函数注册新用户。
    \n如果用户名已存在或参数为空，注册失败。
    Args:
        username (str): 用户名
        password (str): 密码
    Returns:
        tuple: (bool, str)，bool表示注册是否成功，str为提示信息
    """
    if not username or not password:# 用户名和密码非空
        return False, "用户名或密码不能为空"
    users = load_users()#  加载已存储用户
    if username in users:# 用户查重
        return False, "用户名已存在"
    users[username] = generate_password_hash(
        password,
        method="scrypt:32768:8:1",
        salt_length=16
    )# 将用户名和密码哈希存入users字典
    save_users(users)# 将users字典写入users.json
    return True, "注册成功"

def login_user(username, password):
    """
    此函数用于用户登录。
    \n校验用户名和密码。
    Args:
        username (str): 用户名
        password (str): 密码
    Returns:
        tuple: (bool, str)，bool表示登录是否成功，str为提示信息
    """
    users = load_users()
    stored_hash = users.get(username)# 获取存储的密码哈希
    if stored_hash and check_password_hash(stored_hash, password):# 如果取到哈希值且校验通过，则登录成功
        return True, "登录成功"
    else:
        return False, "用户名或密码错误"