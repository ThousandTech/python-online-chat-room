from flask import Flask, request, jsonify, render_template
# 导入Flask类，request变量(获取前端数据)，jsonify函数(给前端返回json)，ender_template函数(返回html)
from flask_socketio import SocketIO, send# 导入SocketIO类(给Flask应用加上 WebSocket)和send函数(用于广播消息)

import auth# 导入自定义auth模块用于登陆与注册功能
import messages# 导入自定义messages模块用于消息存储功能
import timeutils# 导入自定义timeutils模块用于时间处理功能

app = Flask(__name__)# 创建应用实例'app'
app.config['SECRET_KEY'] = 'secret!'# 为了能在前端安全使用 socket.io，生成一个简单的密钥
socketio = SocketIO(app)# 用socket包装应用实例'app'

@app.route('/')# 路由装饰器,作用为浏览器试图访问根目录'/'时立刻调用下面的index()函数
def index():
    """
    此函数用于首页路由接口调用。
    \n返回聊天室前端页面 index.html。
    Returns:
        HTML: 渲染后的 index.html 页面
    """
    return render_template('index.html')# 返回在templates/目录下找到的index.html给客户端。

@app.route('/register', methods=['POST'])# 注册路由接口'/register'，仅接受POST请求
def register():
    """
    此函数用于用户注册接口调用。
    \n接收前端 JSON 格式用户名和密码，调用 auth.register_user 完成注册。
    Returns:
        json: {success: bool, msg: str}
    """
    data = request.json# 从前端获取发送过来的 JSON 数据，并转为 Python 字典
    # json获取格式示例
    # {
    #   "username": "alice", 
    #   "password": "abc123"
    # }
    success, msg = auth.register_user(data.get('username'), data.get('password'))
    return jsonify({"success": success, "msg": msg})

@app.route('/login', methods=['POST'])
def login():
    """
    此函数用于用户登录接口调用。
    \n接收前端 JSON 格式用户名和密码，调用 auth.login_user 校验。
    Returns:
        json: {success: bool, msg: str}
    """
    data = request.json
    success, msg = auth.login_user(data.get('username'), data.get('password'))
    return jsonify({"success": success, "msg": msg})

@app.route('/messages', methods=['GET'])# 注册路由'/messages'，仅接受GET请求
def get_messages():
    """
    此函数用于获取历史消息接口调用。
    \n返回所有历史消息列表。
    Returns:
        json: 消息列表
    """
    return jsonify(messages.load_messages())# 调用messages.py中的load_messages()函数，返回所有历史消息列表

@socketio.on('message')# 注册一个事件处理器，监听所有客户端通过默认事件"message"发送的数据
def handle_message(data):
    """
    此函数用于聊天消息处理事件接口调用。
    \n接收客户端消息，添加时间戳后广播给所有用户。
    Args:
        msg (str): 客户端发来的文本消息
    """
    username = data.get('username')
    msg = data.get('msg')

    timestamp_data = timeutils.get_message_timestamp()

    message = {
        'username': username,
        'msg': msg,
        'timestamp': timestamp_data['full'],  # 完整时间戳
        'timestamp_data': timestamp_data  # 包含所有时间信息的字典
    }
    
    print(f'{username}:{msg}')# 服务端日志输出
    messages.save_message(message)# 调用messages.py中的save_message()函数，将消息保存到messages.json文件中
    send(message, broadcast=True)# 向所有已连接的客户端广播'message'

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)# 启动 SocketIO 的开发服务器以支持WebSocket，debug=True 会开启热重载和错误追踪
