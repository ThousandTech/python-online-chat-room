import json# 导入json模块解析和保存json
import os# 导入os模块进行文件操作

USERS_FILE = 'data/users.json'# 用户数据文件路径
# json存储格式示例
# {
#     "alice": "password123",
#     "bob": "abc123"
# }


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
        json.dump(users, f)# 调用json.dump()方法将users.json写入user字典中的所有用户账号和密码

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
    users[username] = password# users字典新建用户
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
    if users.get(username) == password:# 密码校验
        return True, "登录成功"
    else:
        return False, "用户名或密码错误"