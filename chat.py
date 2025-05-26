from flask import Flask, request, jsonify, render_template
# 导入Flask类，request变量(获取前端数据)，jsonify函数(给前端返回json)，ender_template函数(返回html)
from flask_socketio import SocketIO, send,join_room, leave_room, emit
# 导入SocketIO类(给Flask应用加上 WebSocket)和send函数(用于广播消息)
from functools import wraps
import jwt# 导入JWT库用于生成和验证JSON Web Token
import time


import auth# 导入自定义auth模块用于登陆与注册功能
import timeutils# 导入时间工具模块
from chatroom import chat_manager  # 导入聊天室管理器

# JWT 签名算法和密钥
ALGORITHM    = 'HS256'
SECRET_KEY   = auth.SECRET_KEY

app = Flask(__name__)# 创建应用实例'app'
socketio = SocketIO(app, cors_allowed_origins="*")# 创建 SocketIO 实例，允许跨域请求

# 存储用户会话信息
user_sessions = {}  # session_id -> {'username': str, 'current_room': str}
# 续约阈值：当 token 剩余有效期小于该值（秒）时触发续约
RENEW_THRESHOLD = 300  

def cleanup_session(sid):
    # 1. 从会话表里拿出并删除这条连接
    info = user_sessions.pop(sid, None)
    if not info:
        return

    username = info.get('username')
    room_id  = info.get('current_room')
    if not username or not room_id:
        return

    # 2. 让 Socket.IO 把这个 sid 离开对应的房间
    leave_room(room_id)

    # 3. 通知房间里剩下的人，这个用户已离开
    room = chat_manager.get_room(room_id)
    if room:
        emit(
            'user_left',
            {
                'username': username,
                'room_id': room_id,
                'active_users': room.get_active_users()
            },
            room=room_id
        )


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # 从请求头中获取token
        auth_header = request.headers.get('Authorization')
        if auth_header:
            parts = auth_header.split()
            if len(parts) == 2 and parts[0].lower() == 'bearer':
                token = parts[1]
        
        # 从JSON数据中获取token（备选方法）
        if not token and request.is_json:
            token = request.json.get('token')
            
        if not token:
            return jsonify({'message': '缺少认证Token', 'valid': False}), 401
        
        # 验证token
        valid, result = auth.verify_token(token)
        if not valid:
            return jsonify({'message': result, 'valid': False}), 401
            
        # 添加用户信息到请求
        request.current_user = result
        return f(*args, **kwargs)
    
    return decorated

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
    成功时返回JWT token。
    Returns:
        json: {success: bool, msg: str, token: str}
    """
    data = request.json
    success, msg, token = auth.login_user(data.get('username'), data.get('password'))
    return jsonify({"success": success, "msg": msg, "token": token})

# 添加验证token的路由
@app.route('/verify-token', methods=['POST'])
@token_required
def verify_token_route():
    """
    验证JWT token有效性
    Returns:
        json: {valid: bool, username: str}
    """
    return jsonify({'valid': True, 'username': request.current_user})

@app.route('/api/offline', methods=['POST'])
def handle_offline():
    """
    处理用户离线状态
    """
    data = request.json
    if not data:
        return jsonify({'success': False, 'message': '无效的请求数据'}), 400
        
    username = data.get('username')
    token = data.get('token')
    
    if not username or not token:
        return jsonify({'success': False, 'message': '缺少必要参数'}), 400
    
    # 验证token
    valid, result = auth.verify_token(token)
    if not valid or result != username:
        return jsonify({'success': False, 'message': '无效的认证'}), 401
    
    # 查找用户的所有会话
    sessions_to_remove = []
    for session_id, session_data in user_sessions.items():
        if session_data.get('username') == username:
            sessions_to_remove.append(session_id)
    
    # 处理每个会话
    for session_id in sessions_to_remove:
        user_info = user_sessions[session_id]
        room_id = user_info['current_room']
        
        # 从聊天室移除用户
        room = chat_manager.get_room(room_id)
        if room:
            room.remove_user(username)
            # 通知其他用户（这里可能不会实际发送，因为连接可能已关闭）
            socketio.emit('user_left', {
                'username': username,
                'room_id': room_id,
                'active_users': room.get_active_users()
            }, room=room_id)
        
        del user_sessions[session_id]
    
    return jsonify({'success': True, 'message': '用户已标记为离线'})

@app.route('/rooms', methods=['GET'])
def get_rooms():
    """获取所有聊天室列表"""
    rooms = chat_manager.get_all_rooms()
    return jsonify([room.to_dict() for room in rooms])

@app.route('/rooms/<room_id>/messages', methods=['GET'])
def get_room_messages(room_id):
    """
    支持翻页的消息API（更新版）
    """
    room = chat_manager.get_room(room_id)
    if not room:
        return jsonify({"error": "聊天室不存在"}), 404
    
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    
    print(f"[DEBUG] 请求参数 - room_id: {room_id}, limit: {limit}, offset: {offset}")

    result = room.get_messages(limit, offset)
    
    # 为历史消息扩展时间戳信息
    for message in result['messages']:
        timeutils.expand_message_timestamp(message)

    print(f"[DEBUG] 返回结果 - 消息数量: {len(result['messages'])}, 还有更多: {result['has_more']}, 总计: {result['total_count']}")
    
    return jsonify(result)
@app.route('/rooms', methods=['POST'])
def create_room():
    """创建新聊天室"""
    data = request.json
    room_id = data.get('room_id')
    room_name = data.get('room_name')
    
    if not room_id or not room_name:
        return jsonify({"success": False, "msg": "聊天室ID和名称不能为空"}), 400
    
    try:
        room = chat_manager.create_room(room_id, room_name)
        return jsonify({"success": True, "room": room.to_dict()})
    except ValueError as e:
        return jsonify({"success": False, "msg": str(e)}), 400

@socketio.on('connect')
def handle_connect():
    """客户端连接事件"""
    print(f'客户端 {request.sid} 已连接')

@socketio.on('disconnect')
def handle_disconnect():
    """客户端断开连接事件"""
    session_id = request.sid
    if session_id in user_sessions:
        user_info = user_sessions[session_id]
        username = user_info['username']
        current_room = user_info['current_room']
        
        # 离开Socket.IO房间
        leave_room(current_room)
        
        # 从聊天室移除用户
        room = chat_manager.get_room(current_room)
        if room:
            room.remove_user(username)
            # 通知其他用户
            emit('user_left', {
                'username': username,
                'room_id': current_room,
                'active_users': room.get_active_users()
            }, room=current_room)
        
        del user_sessions[session_id]
    print(f'客户端 {request.sid} 已断开连接')

@socketio.on('heartbeat')
def handle_heartbeat(data):
    username = data.get('username')
    token    = data.get('token')
    sid      = request.sid

    # 1. token 必须存在且要么是 str 要么是 bytes
    if not token or not isinstance(token, (str, bytes)):
        socketio.emit('session_expired', to=sid)
        cleanup_session(sid)
        return

    # 2. 如果是 str，就先转成 bytes
    token_bytes = token.encode('utf-8') if isinstance(token, str) else token

    # 3. 尝试解码（不验证 exp），捕获所有解码错误
    try:
        payload = jwt.decode(
            token_bytes,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_exp": False}
        )
    except (jwt.DecodeError, jwt.InvalidSignatureError, jwt.InvalidTokenError) as e:
        # 只要解码出错，就当作会话过期
        socketio.emit('session_expired', to=sid)
        cleanup_session(sid)
        return

    # 2. 更新最后活跃时间
    user_sessions[sid]['last_hb'] = time.time()

    # 3. 检查剩余时长，低于阈值就续约
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
    remaining = payload['exp'] - time.time()
    if remaining < RENEW_THRESHOLD:     # 比如 RENEW_THRESHOLD = 300（5 分钟）
        new_token = auth.generate_token(username)  # 重新签发
        socketio.emit('token_renewed', {'token': new_token}, to=sid)

    # 4. 返回心跳确认
    socketio.emit('heartbeat_ack', to=sid)

@socketio.on('authenticate')
def handle_authentication(data):
    """处理WebSocket连接的认证"""
    token = data.get('token')
    if not token:
        emit('authentication_failed', {'message': '缺少认证Token'})
        return
        
    valid, username = auth.verify_token(token)
    if not valid:
        emit('authentication_failed', {'message': username})  # username此时包含错误信息
        return
        
    # 认证成功，关联用户和会话
    emit('authentication_success', {'username': username})
    
    # 如果用户之前有会话信息，恢复它
    session_id = request.sid
    for old_sid, session_data in list(user_sessions.items()):
        if session_data.get('username') == username and old_sid != session_id:
            # 复制旧会话信息到新会话
            user_sessions[session_id] = session_data.copy()
            
            # 加入之前的聊天室
            room_id = session_data['current_room']
            join_room(room_id)
            
            # 获取聊天室
            room = chat_manager.get_room(room_id)
            if room:
                room.add_user(username)
                # 向用户发送房间信息
                emit('room_joined', {
                    'room_id': room_id,
                    'room_name': room.room_name,
                    'active_users': room.get_active_users()
                })
                
                # 通知其他用户
                emit('user_joined', {
                    'username': username,
                    'room_id': room_id,
                    'active_users': room.get_active_users()
                }, room=room_id)
            
            # 移除旧会话
            del user_sessions[old_sid]
            return
    
    # 没有找到旧会话，可以进行后续处理，比如等待用户主动加入房间

@socketio.on('user_login')
def handle_user_login(data):
    """用户登录成功后自动加入默认房间"""
    username = data.get('username')
    
    # 验证用户是否已登录
    user = auth.user_manager.get_user(username)
    if not user:
        emit('error', {'msg': '用户未登录'})
        return
    
    # 自动加入默认聊天室
    default_room_id = 'general'
    room = chat_manager.get_room(default_room_id)
    if not room:
        # 如果默认房间不存在，创建它
        room = chat_manager.create_room(default_room_id, '大厅')
    
    session_id = request.sid
    
    # 加入Socket.IO房间
    join_room(default_room_id)
    
    # 加入聊天室
    room.add_user(username)
    user_sessions[session_id] = {
        'username': username,
        'current_room': default_room_id
    }
    
    # 通知其他用户
    emit('user_joined', {
        'username': username,
        'room_id': default_room_id,
        'room_name': room.room_name,
        'active_users': room.get_active_users()
    }, room=default_room_id)
    
    # 向当前用户发送房间信息
    emit('room_joined', {
        'room_id': default_room_id,
        'room_name': room.room_name,
        'active_users': room.get_active_users()
    })
    
    print(f'用户 {username} 自动加入聊天室 {room.room_name}')

@socketio.on('join_room')
def handle_join_room(data):
    """用户加入聊天室事件"""
    username = data.get('username')
    room_id = data.get('room_id', 'general')  # 默认加入大厅
    
    # 验证用户是否已登录
    user = auth.user_manager.get_user(username)
    if not user:
        emit('error', {'msg': '用户未登录'})
        return
    
    # 获取聊天室
    room = chat_manager.get_room(room_id)
    if not room:
        emit('error', {'msg': '聊天室不存在'})
        return
    
    session_id = request.sid
    
    # 如果用户已在其他聊天室，先离开
    if session_id in user_sessions:
        old_room_id = user_sessions[session_id]['current_room']
        if old_room_id != room_id:
            # 离开旧Socket.IO房间
            leave_room(old_room_id)
            # 从旧聊天室移除用户
            old_room = chat_manager.get_room(old_room_id)
            if old_room:
                old_room.remove_user(username)
                # 通知旧房间的其他用户
                emit('user_left', {
                    'username': username,
                    'room_id': old_room_id,
                    'active_users': old_room.get_active_users()
                }, room=old_room_id)
    
    # 加入新Socket.IO房间
    join_room(room_id)
    
    # 加入新聊天室
    room.add_user(username)
    user_sessions[session_id] = {
        'username': username,
        'current_room': room_id
    }
    
    # 通知其他用户
    emit('user_joined', {
        'username': username,
        'room_id': room_id,
        'room_name': room.room_name,
        'active_users': room.get_active_users()
    }, room=room_id)
    
    # 向加入的用户发送确认
    emit('room_joined', {
        'room_id': room_id,
        'room_name': room.room_name,
        'active_users': room.get_active_users()
    })
    
    print(f'用户 {username} 加入聊天室 {room.room_name}')

@socketio.on('send_message')
def handle_send_message(data):
    """处理发送消息事件"""
    session_id = request.sid
    if session_id not in user_sessions:
        emit('error', {'msg': '用户未加入任何聊天室'})
        return
    
    user_info = user_sessions[session_id]
    username = user_info['username']
    room_id = user_info['current_room']
    message_text = data.get('msg')
    
    if not message_text:
        emit('error', {'msg': '消息不能为空'})
        return
    
    # 获取聊天室并添加消息
    room = chat_manager.get_room(room_id)
    if not room:
        emit('error', {'msg': '聊天室不存在'})
        return
    
    # 保存消息
    message = room.add_message(username, message_text)
    
    print(f'[{room.room_name}] {username}: {message_text}')
    
    # 广播消息到聊天室内所有用户
    emit('new_message', message, room=room_id)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000,debug=True)# 启动 SocketIO 的开发服务器以支持WebSocket，debug=True 会开启热重载和错误追踪