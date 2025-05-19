"""
0.0.1版本
实现:
    字符串向全体用户广播功能
    上云
待实现:
    消息漫游和消息存储
    消息时间戳
"""
from flask import Flask, render_template# 导入Flask类和render_template函数(解析html)
from flask_socketio import SocketIO, send# 导入SocketIO类(给Flask应用加上 WebSocket)和send函数(用于广播消息)

app = Flask(__name__)# 创建应用实例'app'
app.config['SECRET_KEY'] = 'chatroom-secret!'# 为了能在前端安全使用 socket.io，生成一个简单的密钥

socketio = SocketIO(
    app,
    async_mode='eventlet',# 并发
    cors_allowed_origins=[
    "http://81.70.200.217",
    "https://thousand-tech.com"# Socket.IO域名白名单
    ]      
)# 用socket包装应用实例'app'

@app.route('/')#路由装饰器,作用为浏览器试图访问根目录'/'时立刻调用下面的index()函数
def index():
    """
    此函数仅返回templates/目录下找到的index.html

    参数:
        无参数
    返回:
        index.html文件
    """
    return render_template('index.html')# 返回在templates/目录下找到的index.html给客户端。

@socketio.on('message')# 注册一个事件处理器，监听所有客户端通过默认事件"message"发送的数据
def handle_message(msg):
    """
    此函数收到任意客户端发来的消息，就原封不动地广播给所有连接

    参数:
        msg(str): 客户端发过来的文本内容
    返回:
        无返回值
    """
    print('Received message:', msg)# 服务端日志输出
    send(msg, broadcast=True)# 向所有已连接的客户端广播'msg'

if __name__ == '__main__':
    socketio.run(app, debug=True)# 启动 SocketIO 的开发服务器以支持WebSocket，debug=True 会开启热重载和错误追踪
