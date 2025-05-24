var socket = io();
var currentUser = null;
var currentRoomId = 'general';
var lastTimestamp = null;
var emojiPickerVisible = false;
var rooms = [];
var activeUsers = [];
var isConnected = false;

/**
 * 此函数格式化时间戳为易读格式。
 * @param {Object} timestamp - 包含时间戳信息的对象
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
    if (!timestamp || !timestamp.timestamp_data) {
        return "";
    }
    
    const data = timestamp.timestamp_data;
    const now = new Date();
    const msgDate = new Date(data.timestamp * 1000);
    
    // 判断是否是同一天
    const isSameDay = now.getDate() === msgDate.getDate() &&
                    now.getMonth() === msgDate.getMonth() &&
                    now.getFullYear() === msgDate.getFullYear();
    
    // 判断是否是同一周
    const dayDiff = Math.floor((now - msgDate) / (24 * 60 * 60 * 1000));
    const isSameWeek = dayDiff < 7 && 
                    now.getDay() >= msgDate.getDay();
    
    // 判断是否是同一年
    const isSameYear = now.getFullYear() === msgDate.getFullYear();
    
    // 根据不同情况返回不同格式的时间戳
    if (isSameDay) {
        return data.time; // 只显示时间 HH:MM
    } else if (isSameWeek) {
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        return `周${weekdays[data.weekday]} ${data.time}`;
    } else if (isSameYear) {
        return `${data.month}月${data.day}日 ${data.time}`;
    } else {
        return `${data.year}年${data.month}月${data.day}日 ${data.time}`;
    }
}

/**
 * 此函数判断两个时间戳是否在同一分钟内。
 * @param {Object} timestamp1 - 第一个时间戳对象
 * @param {Object} timestamp2 - 第二个时间戳对象
 * @returns {boolean} 是否在同一分钟内
 */
function isSameMinute(timestamp1, timestamp2) {
    if (!timestamp1 || !timestamp2) return false;
    
    // 尝试从timestamp_data中获取时间戳，如果不存在则尝试从timestamp字符串解析
    let time1, time2;
    
    if (timestamp1.timestamp_data) {
        time1 = timestamp1.timestamp_data.timestamp;
    } else {
        time1 = new Date(timestamp1.timestamp).getTime() / 1000;
    }
    
    if (timestamp2.timestamp_data) {
        time2 = timestamp2.timestamp_data.timestamp;
    } else {
        time2 = new Date(timestamp2.timestamp).getTime() / 1000;
    }
    
    // 检查时间戳是否在同一分钟内
    return Math.floor(time1 / 60) === Math.floor(time2 / 60);
}

/**
 * 此函数格式化历史消息时间戳，处理新旧两种格式。
 * @param {Object} data - 消息数据
 * @returns {string} 格式化后的时间字符串
 */
function formatHistoricalTimestamp(data) {
    // 如果是新格式（包含timestamp_data）
    if (data.timestamp_data) {
        return formatTimestamp(data);
    }
    
    // 老格式的时间戳处理（仅有timestamp字符串）
    const msgDate = new Date(data.timestamp);
    const now = new Date();
    
    // 提取时间部分
    const hours = msgDate.getHours().toString().padStart(2, '0');
    const minutes = msgDate.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    
    // 判断是否是同一天
    const isSameDay = now.getDate() === msgDate.getDate() &&
                    now.getMonth() === msgDate.getMonth() &&
                    now.getFullYear() === msgDate.getFullYear();
    
    // 判断是否是同一周
    const dayDiff = Math.floor((now - msgDate) / (24 * 60 * 60 * 1000));
    const isSameWeek = dayDiff < 7 && 
                    now.getDay() >= msgDate.getDay();
    
    // 判断是否是同一年
    const isSameYear = now.getFullYear() === msgDate.getFullYear();
    
    // 根据不同情况返回不同格式的时间戳
    if (isSameDay) {
        return timeStr; // 只显示时间 HH:MM
    } else if (isSameWeek) {
        const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
        return `周${weekdays[msgDate.getDay()]} ${timeStr}`;
    } else if (isSameYear) {
        return `${msgDate.getMonth()+1}月${msgDate.getDate()}日 ${timeStr}`;
    } else {
        return `${msgDate.getFullYear()}年${msgDate.getMonth()+1}月${msgDate.getDate()}日 ${timeStr}`;
    }
}

/**
 * 用户登录成功后的处理
 */
function onLoginSuccess(username) {
    currentUser = username;
    
    // 更新UI
    document.getElementById('pageTitle').style.display = 'none';
    document.getElementById('loginArea').style.display = 'none';
    document.getElementById('registerArea').style.display = 'none';
    document.getElementById('chatPanel').style.display = '';
    
    // 等待连接建立后自动加入默认房间
    if (socket.connected) {
        autoJoinDefaultRoom();
    } else {
        // 如果尚未连接，等待连接事件
        socket.once('connect', () => {
            autoJoinDefaultRoom();
        });
    }
}

/**
 * 自动加入默认房间
 */
function autoJoinDefaultRoom() {
    // 通知服务器用户已登录，自动加入默认房间
    socket.emit('user_login', {
        username: currentUser
    });
    
    // 加载聊天室列表
    loadRooms();
}

/**
 * 加载聊天室列表
 */
function loadRooms() {
    fetch('/rooms')
        .then(res => res.json())
        .then(roomsData => {
            rooms = roomsData;
            updateRoomsList();
        })
        .catch(err => console.error('加载聊天室列表失败:', err));
}

/**
 * 更新聊天室列表显示
 */
function updateRoomsList() {
    const roomsList = document.getElementById('roomsList');
    if (!roomsList) return;
    
    roomsList.innerHTML = '';
    
    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = `room-item ${room.room_id === currentRoomId ? 'active' : ''}`;
        roomItem.onclick = () => joinRoom(room.room_id);
        
        roomItem.innerHTML = `
            <div class="room-item-info">
                <h5>${room.room_name}</h5>
                <span>在线: ${room.user_count}人</span>
            </div>
        `;
        
        roomsList.appendChild(roomItem);
    });
}

/**
 * 加入聊天室
 */
function joinRoom(roomId) {
    if (!currentUser) {
        alert('请先登录');
        return;
    }
    
    if (roomId === currentRoomId) {
        toggleRoomList(); // 如果是当前房间，则关闭侧边栏
        return;
    }
    
    currentRoomId = roomId;
    socket.emit('join_room', {
        username: currentUser,
        room_id: roomId
    });
    
    // 清空消息区域
    document.getElementById('messages').innerHTML = '';
    lastTimestamp = null;
    
    // 加载该聊天室的历史消息
    fetch(`/rooms/${roomId}/messages`)
        .then(res => res.json())
        .then(msgs => {
            processHistoricalMessages(msgs);
        })
        .catch(err => console.error('加载聊天室消息失败:', err));
    
    // 更新UI
    updateRoomsList();
    
    // 关闭侧边栏
    const sidebar = document.getElementById('roomSidebar');
    const chatContent = document.getElementById('chatContent') || document.querySelector('.chat-content');
    if (sidebar) {
        sidebar.classList.remove('show');
    }
    if (chatContent) {
        chatContent.classList.remove('sidebar-open');
    }
}

/**
 * 切换房间列表侧边栏
 */
function toggleRoomList() {
    const sidebar = document.getElementById('roomSidebar');
    const chatContent = document.querySelector('.chat-content');
    if (!sidebar || !chatContent) return;
    
    if (sidebar.classList.contains('show')) {
        sidebar.classList.remove('show');
        chatContent.classList.remove('sidebar-open');
    } else {
        sidebar.classList.add('show');
        chatContent.classList.add('sidebar-open');
        loadRooms(); // 重新加载房间列表
    }
}

/**
 * 显示创建房间对话框
 */
function showCreateRoomDialog() {
    document.getElementById('createRoomDialog').style.display = 'flex';
    document.getElementById('newRoomId').value = '';
    document.getElementById('newRoomName').value = '';
    document.getElementById('createRoomMsg').textContent = '';
}

/**
 * 隐藏创建房间对话框
 */
function hideCreateRoomDialog() {
    document.getElementById('createRoomDialog').style.display = 'none';
}

/**
 * 创建新聊天室
 */
function createRoom() {
    const roomId = document.getElementById('newRoomId').value.trim();
    const roomName = document.getElementById('newRoomName').value.trim();
    const msgEl = document.getElementById('createRoomMsg');
    
    if (!roomId || !roomName) {
        msgEl.textContent = '请填写房间ID和名称';
        msgEl.style.color = '#e53e3e';
        return;
    }
    
    // 验证房间ID格式
    if (!/^[a-zA-Z0-9_-]+$/.test(roomId)) {
        msgEl.textContent = '房间ID只能包含英文字母、数字、下划线和横线';
        msgEl.style.color = '#e53e3e';
        return;
    }
    
    fetch('/rooms', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            room_id: roomId,
            room_name: roomName
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            msgEl.textContent = '聊天室创建成功！';
            msgEl.style.color = '#38a169';
            setTimeout(() => {
                hideCreateRoomDialog();
                loadRooms(); // 重新加载房间列表
                joinRoom(roomId); // 自动加入新创建的房间
            }, 1000);
        } else {
            msgEl.textContent = data.msg;
            msgEl.style.color = '#e53e3e';
        }
    })
    .catch(err => {
        msgEl.textContent = '创建失败，请重试';
        msgEl.style.color = '#e53e3e';
        console.error('创建聊天室失败:', err);
    });
}

/**
 * 更新在线用户列表
 */
function updateActiveUsers(users) {
    activeUsers = users;
    const usersList = document.getElementById('onlineUsersList');
    if (usersList) {
        usersList.innerHTML = '';
        
        users.forEach(username => {
            const userItem = document.createElement('div');
            userItem.className = `user-item ${username === currentUser ? 'me' : ''}`;
            userItem.textContent = username === currentUser ? `${username} (我)` : username;
            usersList.appendChild(userItem);
        });
    }
    
    // 更新顶部用户数量显示
    const userCountEl = document.getElementById('currentRoomUsers');
    if (userCountEl) {
        userCountEl.textContent = `在线: ${users.length}人`;
    }
}

/**
 * 登出功能
 */
function logout() {
    // 清除用户状态
    currentUser = null;
    currentRoomId = 'general';
    lastTimestamp = null;
    activeUsers = [];
    rooms = [];
    
    // 断开Socket连接
    socket.disconnect();
    
    // 重置UI
    document.getElementById('pageTitle').style.display = '';
    document.getElementById('loginArea').style.display = '';
    document.getElementById('chatPanel').style.display = 'none';
    const sidebar = document.getElementById('roomSidebar');
    const chatContent = document.querySelector('.chat-content');
    if (sidebar) {
        sidebar.classList.remove('show');
    }
    if (chatContent) {
        chatContent.classList.remove('sidebar-open');
    }
    
    // 清空输入框和消息
    document.getElementById('login_user').value = '';
    document.getElementById('login_pass').value = '';
    document.getElementById('loginMsg').textContent = '';
    document.getElementById('messages').innerHTML = '';
    
    // 重新连接Socket
    setTimeout(() => {
        socket.connect();
    }, 100);
}

// WebSocket 事件监听

socket.on('connect', function() {
    console.log('已连接到服务器');
    isConnected = true;
});

socket.on('disconnect', function() {
    console.log('与服务器断开连接');
    isConnected = false;
});

socket.on('new_message', function(data){
    // 检查是否需要显示时间戳标记
    const showTimestamp = !lastTimestamp || !isSameMinute(data, lastTimestamp);
    
    if (showTimestamp) {
        const formattedTime = formatTimestamp(data);
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp-divider';
        timestampDiv.innerHTML = `<span>${formattedTime}</span>`;
        document.getElementById('messages').appendChild(timestampDiv);
    }
    
    // 创建消息项
    const messageItem = document.createElement('div');
    messageItem.className = `message-item ${data.username === currentUser ? 'me' : 'other'}`;
    
    const usernameLabel = document.createElement('div');
    usernameLabel.className = 'username-label';
    usernameLabel.textContent = data.username;
    messageItem.appendChild(usernameLabel);
    
    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';
    const replaceUrlsWithLinks = (text) => {
        return text.replace(/(https?:\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])?)/g, '<a href="$1" target="_blank">$1</a>');
    };
    messageBubble.innerHTML = replaceUrlsWithLinks(data.msg);
    messageItem.appendChild(messageBubble);
    
    document.getElementById('messages').appendChild(messageItem);
    
    lastTimestamp = data;
    scrollToBottom();
});

socket.on('room_joined', function(data) {
    // 更新当前房间信息
    currentRoomId = data.room_id;
    const roomNameEl = document.getElementById('currentRoomName');
    if (roomNameEl) {
        roomNameEl.textContent = data.room_name;
    }
    updateActiveUsers(data.active_users);
    
    console.log(`成功加入聊天室: ${data.room_name}`);
});

socket.on('user_joined', function(data) {
    if (data.room_id === currentRoomId) {
        updateActiveUsers(data.active_users);
        
        // 显示用户加入消息（排除自己）
        if (data.username !== currentUser) {
            const systemMsg = document.createElement('div');
            systemMsg.className = 'timestamp-divider';
            systemMsg.innerHTML = `<span>${data.username} 加入了聊天室</span>`;
            document.getElementById('messages').appendChild(systemMsg);
            scrollToBottom();
        }
    }
});

socket.on('user_left', function(data) {
    if (data.room_id === currentRoomId) {
        updateActiveUsers(data.active_users);
        
        // 显示用户离开消息
        const systemMsg = document.createElement('div');
        systemMsg.className = 'timestamp-divider';
        systemMsg.innerHTML = `<span>${data.username} 离开了聊天室</span>`;
        document.getElementById('messages').appendChild(systemMsg);
        scrollToBottom();
    }
});

socket.on('error', function(data) {
    alert('错误: ' + data.msg);
    console.error('Socket错误:', data.msg);
});

/**
 * 此函数发送消息到服务器。
 */
function sendMessage() {
    var input = document.getElementById('myMessage');
    var raw = input.value;
    
    if (!currentUser) {
        alert('请先登录');
        return;
    }
    
    if (raw.trim() !== "") {
        socket.emit('send_message', {
            msg: raw
        });
        input.value = '';
        
        if (emojiPickerVisible) {
            emojiPickerVisible = false;
            document.getElementById('emojiPicker').style.display = 'none';
            document.removeEventListener('click', closeEmojiPickerOnClickOutside);
        }
    } else {
        alert('不能发送空白消息');
    }
}

/**
 * 此函数自动滚动消息区域到底部。
 */
function scrollToBottom() {
    var messages = document.getElementById('messages');
    if (messages) {
        messages.scrollTop = messages.scrollHeight;
    }
}

/**
 * 此函数处理历史消息并添加时间戳分隔。
 * @param {Array} messages - 消息列表
 */
function processHistoricalMessages(messages) {
    const messagesList = document.getElementById('messages');
    if (!messagesList) return;
    
    messagesList.innerHTML = "";
    let lastMsgTimestamp = null;
    
    messages.forEach(function(data){
        // 检查是否需要显示时间戳标记
        const showTimestamp = !lastMsgTimestamp || !isSameMinute(data, lastMsgTimestamp);
        
        // 如果需要显示时间戳，先添加一个时间戳分隔符
        if (showTimestamp) {
            const formattedTime = formatHistoricalTimestamp(data);
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-divider';
            timestampDiv.innerHTML = `<span>${formattedTime}</span>`;
            messagesList.appendChild(timestampDiv);
        }
        
        // 创建消息项容器
        const messageItem = document.createElement('div');
        messageItem.className = `message-item ${data.username === currentUser ? 'me' : 'other'}`;
        
        // 添加用户名标签
        const usernameLabel = document.createElement('div');
        usernameLabel.className = 'username-label';
        usernameLabel.textContent = data.username;
        messageItem.appendChild(usernameLabel);
        
        // 添加消息气泡
        const messageBubble = document.createElement('div');
        messageBubble.className = 'message-bubble';
        // 将消息中的URL转换为可点击链接
        const replaceUrlsWithLinks = (text) => {
            return text.replace(/(https?:\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])?)/g, '<a href="$1" target="_blank">$1</a>');
        };
        messageBubble.innerHTML = replaceUrlsWithLinks(data.msg);
        messageItem.appendChild(messageBubble);
        
        // 将消息项添加到消息列表
        messagesList.appendChild(messageItem);
        
        // 更新上一条消息的时间戳
        lastMsgTimestamp = data;
    });
    
    // 全局变量保存最后一条消息时间戳
    lastTimestamp = messages.length > 0 ? messages[messages.length-1] : null;
    
    scrollToBottom();
}

/**
 * 此函数处理用户登录。
 */
function login() {
    const username = document.getElementById('login_user').value;
    const password = document.getElementById('login_pass').value;
    
    if (!username || !password) {
        document.getElementById('loginMsg').textContent = '请输入用户名和密码';
        return;
    }
    
    fetch('/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: username,
            password: password
        })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('loginMsg').textContent = data.msg;
        if(data.success){
            onLoginSuccess(username);
        }
    })
    .catch(err => {
        document.getElementById('loginMsg').textContent = '登录失败，请重试';
        console.error('登录错误:', err);
    });
}

/**
 * 此函数处理用户注册。
 */
function register() {
    fetch('/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: document.getElementById('reg_user').value,
            password: document.getElementById('reg_pass').value
        })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('registerMsg').textContent = data.msg;
        if(data.success){
            showLogin();
            // 清空注册表单
            document.getElementById('reg_user').value = '';
            document.getElementById('reg_pass').value = '';
        }
    });
}

/**
 * 此函数显示注册页面。
 */
function showRegister() {
    document.getElementById('loginArea').style.display = 'none';
    document.getElementById('registerArea').style.display = '';
    document.getElementById('pageTitle').style.display = '';
}

/**
 * 此函数显示登录页面。
 */
function showLogin() {
    document.getElementById('loginArea').style.display = '';
    document.getElementById('registerArea').style.display = 'none';
    document.getElementById('pageTitle').style.display = '';
}

/**
 * 此函数切换表情选择器的显示状态。
 */
function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    emojiPickerVisible = !emojiPickerVisible;
    emojiPicker.style.display = emojiPickerVisible ? 'block' : 'none';
    
    // 点击其他区域关闭表情选择器
    if (emojiPickerVisible) {
        setTimeout(() => {
            document.addEventListener('click', closeEmojiPickerOnClickOutside);
        }, 0);
    }
}

/**
 * 点击表情选择器外部区域时关闭它。
 */
function closeEmojiPickerOnClickOutside(event) {
    const emojiPicker = document.getElementById('emojiPicker');
    const emojiBtn = document.getElementById('emojiBtn');
    
    if (!emojiPicker.contains(event.target) && event.target !== emojiBtn) {
        emojiPickerVisible = false;
        emojiPicker.style.display = 'none';
        document.removeEventListener('click', closeEmojiPickerOnClickOutside);
    }
}

// 当文档加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 配置emoji选择器事件
    const emojiPicker = document.querySelector('emoji-picker');
    
    if (emojiPicker) {
        emojiPicker.addEventListener('emoji-click', event => {
            const myMessage = document.getElementById('myMessage');
            myMessage.value += event.detail.unicode;
            myMessage.focus();
        });
    }
    
    // 按回车键发送消息（Enter 发送，Shift+Enter 换行）
    document.getElementById('myMessage').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        // Shift+Enter 允许换行
    });
    
    // 模态对话框点击外部关闭
    const createRoomDialog = document.getElementById('createRoomDialog');
    if (createRoomDialog) {
        createRoomDialog.addEventListener('click', function(e) {
            if (e.target === this) {
                hideCreateRoomDialog();
            }
        });
    }
    
    // 检测是否有聊天面板显示并添加相应类名
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.target.id === 'chatPanel' && 
                mutation.attributeName === 'style') {
                if (document.getElementById('chatPanel').style.display !== 'none') {
                    document.body.classList.add('chat-active');
                } else {
                    document.body.classList.remove('chat-active');
                }
            }
        });
    });
    
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel) {
        observer.observe(chatPanel, {attributes: true});
    }
});