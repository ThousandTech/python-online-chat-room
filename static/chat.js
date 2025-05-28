var socket = io();
var currentUser = null;
var currentRoomId = 'general';
var lastTimestamp = null;
var emojiPickerVisible = false;
var rooms = [];
var activeUsers = [];
var isConnected = false;
var isLoadingMessages = false;
var hasMoreMessages = true;
var currentOffset = 0;
let heartbeatInterval;
var cdkeyVerified = false;

// 修改socket连接处理，添加身份验证和心跳启动
socket.on('connect', function() {
    console.log('已连接到服务器');
    isConnected = true;
    
    // 如果已登录，发送身份验证
    const token = localStorage.getItem('chatToken');
    if (token) {
        socket.emit('authenticate', { token: token });
    }
    
    // 启动心跳
    startHeartbeat();
});

socket.on('token_renewed', data => {
  localStorage.setItem('chatToken', data.token);
});

// 在断开连接时清理心跳
socket.on('disconnect', function() {
    console.log('与服务器断开连接');
    isConnected = false;
    clearInterval(heartbeatInterval);
});

// 添加认证相关的事件处理
socket.on('authentication_success', function(data) {
    console.log('身份验证成功:', data.username);
    
    if (!currentUser && data.username) {
        // 首次登录流程
        currentUser = data.username;
        onLoginSuccess(data.username);
    } 
    else {
        // 脱机重连后，确保重新加入大厅
        autoJoinDefaultRoom();
    }
});

socket.on('authentication_failed', function(data) {
    console.error('身份验证失败:', data.message);
    // 清除无效的token
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');
    
    // 如果当前有用户登录，提示重新登录
    if (currentUser) {
        alert('登录已过期，请重新登录');
        logout();
    }
});

socket.on('session_expired', function(data) {
    console.error('会话已过期:', data.message);
    // 清除无效的token
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');
    
    // 提示用户重新登录
    alert('会话已过期，请重新登录');
    logout();
});

// 添加心跳机制
function startHeartbeat() {
  clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (socket.connected && currentUser) {
      const token = localStorage.getItem('chatToken');
      socket.emit('heartbeat', {
        username: currentUser,
        token: token
      });
    }
  }, 30000);
}

// 页面关闭前发送离线信息
window.addEventListener('beforeunload', function() {
    if (socket.connected && currentUser) {
        const token = localStorage.getItem('chatToken');
        if (token) {
            // 使用sendBeacon API发送离线状态，即使页面关闭也能完成请求
            navigator.sendBeacon('/api/offline', JSON.stringify({
                username: currentUser,
                token: token
            }));
        }
    }
});

// 修改需要授权的API请求，添加Token
function loadRooms() {
    const token = localStorage.getItem('chatToken');
    
    fetch('/rooms', {
        headers: token ? {
            'Authorization': `Bearer ${token}`
        } : {}
    })
    .then(res => res.json())
    .then(roomsData => {
        rooms = roomsData;
        updateRoomsList();
    })
    .catch(err => console.error('加载聊天室列表失败:', err));
}

// 修改加入房间函数，添加Token
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
    currentOffset = 0;
    hasMoreMessages = true;
    
    // 清空消息区域
    document.getElementById('messages').innerHTML = '';
    lastTimestamp = null;
    
    // 显示加载提示
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = '<div class="timestamp-divider"><span>正在加载历史消息...</span></div>';
    
    // 设置标记，表示正在加载历史消息
    messagesContainer.setAttribute('data-loading', 'true');
    
    const token = localStorage.getItem('chatToken');
    
    // 先加载历史消息，再发送加入房间请求
    fetch(`/rooms/${roomId}/messages`, {
        headers: token ? {
            'Authorization': `Bearer ${token}`
        } : {}
    })
        .then(res => res.json())
        .then(data => {
            console.log('获取到的消息数据:', data);
            
            // 检查数据格式
            let messages;
            if (Array.isArray(data)) {
                messages = data;
            } else if (data.messages && Array.isArray(data.messages)) {
                messages = data.messages;
            } else {
                console.error('无效的消息数据格式:', data);
                messages = [];
            }
            
            // 标记加载成功
            messagesContainer.setAttribute('data-loaded', 'true');
            messagesContainer.removeAttribute('data-loading');
            
            processHistoricalMessages(messages);
            
            // 历史消息加载完成后再加入房间
            socket.emit('join_room', {
                username: currentUser,
                room_id: roomId
            });
        })
        .catch(err => {
            console.error('加载聊天室消息失败:', err);
            // 标记加载失败
            messagesContainer.setAttribute('data-load-failed', 'true');
            messagesContainer.removeAttribute('data-loading');
            messagesContainer.innerHTML = '<div class="timestamp-divider"><span>加载历史消息失败</span></div>';
            
            // 即使加载失败也要加入房间
            socket.emit('join_room', {
                username: currentUser,
                room_id: roomId
            });
        });
    
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
        return `周${weekdays[msgDate.getDay()]} ${data.time}`;
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
    
    let time1, time2;
    
    // 获取第一个时间戳的Unix时间戳值
    if (timestamp1.timestamp_data && timestamp1.timestamp_data.timestamp) {
        time1 = timestamp1.timestamp_data.timestamp;
    } else if (timestamp1.ts) {
        time1 = timestamp1.ts;
    } else if (timestamp1.timestamp) {
        time1 = new Date(timestamp1.timestamp).getTime() / 1000;
    } else {
        return false;
    }
    
    // 获取第二个时间戳的Unix时间戳值
    if (timestamp2.timestamp_data && timestamp2.timestamp_data.timestamp) {
        time2 = timestamp2.timestamp_data.timestamp;
    } else if (timestamp2.ts) {
        time2 = timestamp2.ts;
    } else if (timestamp2.timestamp) {
        time2 = new Date(timestamp2.timestamp).getTime() / 1000;
    } else {
        return false;
    }
    
    // 检查时间戳是否在同一分钟内
    const minute1 = Math.floor(time1 / 60);
    const minute2 = Math.floor(time2 / 60);
    
    return minute1 === minute2;
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

socket.on('room_joined', function(data) {
    // 更新当前房间信息
    currentRoomId = data.room_id;
    const roomNameEl = document.getElementById('currentRoomName');
    if (roomNameEl) {
        roomNameEl.textContent = data.room_name;
    }
    updateActiveUsers(data.active_users);
    
    // 只有在初次加载失败或者消息区域确实为空时才备用加载
    const messagesContainer = document.getElementById('messages');
    const isLoadFailed = messagesContainer && messagesContainer.hasAttribute('data-load-failed');
    const isEmpty = messagesContainer && messagesContainer.children.length === 0;
    const notLoaded = messagesContainer && !messagesContainer.hasAttribute('data-loaded') && !messagesContainer.hasAttribute('data-loading');
    
    if (messagesContainer && (isLoadFailed || isEmpty || notLoaded)) {
        console.log('备用加载历史消息...');
        fetch(`/rooms/${data.room_id}/messages`)
            .then(res => res.json())
            .then(responseData => {
                console.log('备用加载的消息数据:', responseData);
                
                // 检查数据格式
                let messages;
                if (Array.isArray(responseData)) {
                    messages = responseData;
                } else if (responseData.messages && Array.isArray(responseData.messages)) {
                    messages = responseData.messages;
                } else {
                    console.error('无效的消息数据格式:', responseData);
                    messages = [];
                }
                
                // 标记已加载
                messagesContainer.setAttribute('data-loaded', 'true');
                messagesContainer.removeAttribute('data-load-failed');
                
                processHistoricalMessages(messages);
            })
            .catch(err => console.error('备用加载聊天室消息失败:', err));
    }
    
    console.log(`成功加入聊天室: ${data.room_name}`);
});

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
    // 清除本地存储的token
    localStorage.removeItem('chatToken');
    localStorage.removeItem('chatUsername');

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
    
    // 首先确保所有消息都有标准化的时间戳格式
    const processedMessages = messages.map(msg => expandMessageTimestamp(msg));
    
    // 记录上一个添加的元素类型，用于避免连续添加时间戳
    let lastAddedType = null;
    
    processedMessages.forEach(function(data, index){
        // 决定是否显示时间戳
        let showTimestamp = false;
        
        if (index === 0) {
            // 第一条消息总是显示时间戳
            showTimestamp = true;
        } else {
            // 直接比较当前消息和上一条消息的分钟值
            const prevMsg = processedMessages[index - 1];
            const currMinute = Math.floor(data.timestamp_data.timestamp / 60);
            const prevMinute = Math.floor(prevMsg.timestamp_data.timestamp / 60);
            
            showTimestamp = currMinute !== prevMinute;
        }
        
        // 避免连续添加时间戳分隔符
        if (showTimestamp && lastAddedType !== 'timestamp') {
            const formattedTime = formatHistoricalTimestamp(data);
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-divider';
            timestampDiv.innerHTML = `<span>${formattedTime}</span>`;
            messagesList.appendChild(timestampDiv);
            lastAddedType = 'timestamp';
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
        const replaceUrlsWithLinks = (text) => {
            return text.replace(/(https?:\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])?)/g, '<a href="$1" target="_blank">$1</a>');
        };
        messageBubble.innerHTML = replaceUrlsWithLinks(data.msg);
        messageItem.appendChild(messageBubble);
        
        // 将消息项添加到消息列表
        messagesList.appendChild(messageItem);
        lastAddedType = 'message';
    });
    
    // 修复：正确设置全局lastTimestamp，避免与新消息时间戳冲突
    if (processedMessages.length > 0) {
        lastTimestamp = processedMessages[processedMessages.length - 1];
    } else {
        lastTimestamp = null;
    }
    
    scrollToBottom();
}

/**
 * 验证注册密钥
 */
// chat.js (更新验证函数)
// chat.js (修复版本的验证函数)
// 修改验证函数以支持弹出式提示
function verifyCdkey() {
    const cdkeyInput = document.getElementById('reg_cdkey');
    const cdkey = cdkeyInput.value.trim().toUpperCase();
    const statusEl = document.getElementById('cdkeyStatus');
    const submitBtn = document.getElementById('submitRegisterBtn');
    const verifyBtn = document.getElementById('verifyCdkeyBtn');
    
    console.log('[DEBUG] 原始输入:', cdkeyInput.value);
    console.log('[DEBUG] 处理后密钥:', cdkey);
    console.log('[DEBUG] 密钥长度:', cdkey.length);
    
    // 显示提示框的函数
    function showStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = `cdkey-status ${type} show`;
        
        // 3秒后自动隐藏
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 3000);
    }
    
    if (!cdkey) {
        showStatus('请输入注册密钥', 'error');
        return;
    }
    
    // 前端基础验证
    if (cdkey.length !== 10) {
        showStatus(`注册密钥长度不正确（当前${cdkey.length}位，需要10位）`, 'error');
        cdkeyVerified = false;
        submitBtn.disabled = true;
        return;
    }
    
    if (!/^[A-Z0-9]+$/.test(cdkey)) {
        showStatus('注册密钥格式不正确（只能包含大写字母和数字）', 'error');
        cdkeyVerified = false;
        submitBtn.disabled = true;
        return;
    }
    
    // 禁用验证按钮，显示验证中状态
    verifyBtn.disabled = true;
    verifyBtn.textContent = '验证中...';
    showStatus('正在验证注册密钥...', 'pending');
    
    console.log('[DEBUG] 发送验证请求，密钥:', cdkey);
    
    // 向服务器验证
    fetch('/verify-cdkey', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cdkey: cdkey })
    })
    .then(response => {
        console.log('[DEBUG] 服务器响应状态:', response.status);
        console.log('[DEBUG] 响应头:', response.headers);
        
        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }
        
        return response.json();
    })
    .then(data => {
        console.log('[DEBUG] 服务器响应数据:', data);
        console.log('[DEBUG] 验证结果:', data.valid);
        console.log('[DEBUG] 消息:', data.message);
        
        if (data.valid === true) {
            showStatus('✓ 注册密钥有效', 'success');
            cdkeyVerified = true;
            submitBtn.disabled = false;
            console.log('[DEBUG] 验证成功，已启用注册按钮');
        } else {
            showStatus('✗ ' + (data.message || '密钥无效'), 'error');
            cdkeyVerified = false;
            submitBtn.disabled = true;
            console.log('[DEBUG] 验证失败:', data.message);
        }
    })
    .catch(err => {
        console.error('[ERROR] 验证请求失败:', err);
        showStatus('网络错误，请重试', 'error');
        cdkeyVerified = false;
        submitBtn.disabled = true;
    })
    .finally(() => {
        verifyBtn.disabled = false;
        verifyBtn.textContent = '验证';
        console.log('[DEBUG] 验证流程完成');
    });
}

// 修复输入框的实时处理
document.addEventListener('DOMContentLoaded', function() {
    const cdkeyInput = document.getElementById('reg_cdkey');
    if (cdkeyInput) {
        cdkeyInput.addEventListener('input', function(e) {
            // 输入变化时重置验证状态
            cdkeyVerified = false;
            document.getElementById('submitRegisterBtn').disabled = true;
            
            // 隐藏弹出提示
            const statusEl = document.getElementById('cdkeyStatus');
            statusEl.classList.remove('show');
            
            // 转换为大写并限制输入，确保不超过10位
            let value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            if (value.length > 10) {
                value = value.substring(0, 10);
            }
            this.value = value;
            
            console.log('[DEBUG] 输入框内容更新:', value);
        });
        
        // 添加粘贴事件处理
        cdkeyInput.addEventListener('paste', function(e) {
            setTimeout(() => {
                let value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (value.length > 10) {
                    value = value.substring(0, 10);
                }
                this.value = value;
                console.log('[DEBUG] 粘贴后内容:', value);
            }, 0);
        });
    }
});

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
            // 保存JWT到localStorage
            if (data.token) {
                localStorage.setItem('chatToken', data.token);
                localStorage.setItem('chatUsername', username);
            }
            onLoginSuccess(username);
        }
    })
    .catch(err => {
        document.getElementById('loginMsg').textContent = '登录失败，请重试';
        console.error('登录错误:', err);
    });
}

/**
 * 此函数处理用户注册。(更新版本)
 */
function register() {
    const username = document.getElementById('reg_user').value.trim();
    const password = document.getElementById('reg_pass').value;
    const cdkey = document.getElementById('reg_cdkey').value.trim();
    const msgEl = document.getElementById('registerMsg');
    
    if (!username || !password) {
        msgEl.textContent = '请输入用户名和密码';
        msgEl.style.color = '#e53e3e';
        return;
    }
    
    if (!cdkey) {
        msgEl.textContent = '请输入注册密钥';
        msgEl.style.color = '#e53e3e';
        return;
    }
    
    if (!cdkeyVerified) {
        msgEl.textContent = '请先验证注册密钥';
        msgEl.style.color = '#e53e3e';
        return;
    }
    
    fetch('/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: username,
            password: password,
            cdkey: cdkey
        })
    })
    .then(r => r.json())
    .then(data => {
        msgEl.textContent = data.msg;
        msgEl.style.color = data.success ? '#38a169' : '#e53e3e';
        
        if(data.success){
            // 注册成功，清空表单并返回登录页面
            setTimeout(() => {
                showLogin();
                document.getElementById('reg_user').value = '';
                document.getElementById('reg_pass').value = '';
                document.getElementById('reg_cdkey').value = '';
                document.getElementById('cdkeyStatus').textContent = '';
                document.getElementById('submitRegisterBtn').disabled = true;
                cdkeyVerified = false;
            }, 1500);
        }
    })
    .catch(err => {
        msgEl.textContent = '注册失败，请重试';
        msgEl.style.color = '#e53e3e';
        console.error('注册错误:', err);
    });
}

/**
 * 显示注册页面时重置状态
 */
function showRegister() {
    document.getElementById('loginArea').style.display = 'none';
    document.getElementById('registerArea').style.display = '';
    document.getElementById('pageTitle').style.display = '';
    
    // 重置注册状态
    cdkeyVerified = false;
    document.getElementById('submitRegisterBtn').disabled = true;
    document.getElementById('cdkeyStatus').textContent = '';
    document.getElementById('registerMsg').textContent = '';
}

// 添加注册密钥输入框的实时验证
document.addEventListener('DOMContentLoaded', function() {
    const cdkeyInput = document.getElementById('reg_cdkey');
    if (cdkeyInput) {
        cdkeyInput.addEventListener('input', function() {
            // 输入变化时重置验证状态
            cdkeyVerified = false;
            document.getElementById('submitRegisterBtn').disabled = true;
            document.getElementById('cdkeyStatus').textContent = '';
            
            // 转换为大写并限制输入
            this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
    }
});

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

    const messagesContainer = document.getElementById('messages');

    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', function() {
            // 当滚动到顶部附近时加载更多消息
            if (this.scrollTop < 100 && hasMoreMessages && !isLoadingMessages) {
                loadMoreMessages();
            }
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

    // 检查本地存储中是否有token
    const token = localStorage.getItem('chatToken');
    const username = localStorage.getItem('chatUsername');
    
    if (token && username) {
        // 验证token有效性
        fetch('/verify-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data.valid) {
                // Token有效，自动登录
                onLoginSuccess(username);
            } else {
                // Token无效，清除存储
                localStorage.removeItem('chatToken');
                localStorage.removeItem('chatUsername');
            }
        })
        .catch(err => {
            console.error('验证token失败:', err);
        });
    }

});

/**
 * 向上滚动加载更多历史消息
 */
function loadMoreMessages() {
    if (isLoadingMessages || !hasMoreMessages || !currentRoomId) {
        return;
    }
    
    isLoadingMessages = true;
    currentOffset += 50; // 每次加载50条
    
    fetch(`/rooms/${currentRoomId}/messages?limit=50&offset=${currentOffset}`)
        .then(res => res.json())
        .then(data => {
            if (data.messages && data.messages.length > 0) {
                prependHistoricalMessages(data.messages);
                hasMoreMessages = data.has_more;
            } else {
                hasMoreMessages = false;
            }
        })
        .catch(err => {
            console.error('加载更多消息失败:', err);
        })
        .finally(() => {
            isLoadingMessages = false;
        });
}

/**
 * 在消息列表顶部添加历史消息
 * @param {Array} messages - 要添加的历史消息列表
 */
function prependHistoricalMessages(messages) {
    const messagesList = document.getElementById('messages');
    const scrollTop = messagesList.scrollTop;
    const scrollHeight = messagesList.scrollHeight;
    
    // 创建临时容器来保存新消息
    const tempContainer = document.createElement('div');
    
    // 首先确保所有消息都有标准化的时间戳格式
    const processedMessages = messages.map(msg => expandMessageTimestamp(msg));
    
    // 记录上一个添加的元素类型，用于避免连续添加时间戳
    let lastAddedType = null;
    // 读取当前列表顶部第一个节点（初始批次的第1条消息的时间戳）
    const existingFirstChild = messagesList.firstChild;
    const existingFirstTimestamp = (
        existingFirstChild &&
        existingFirstChild.classList.contains('timestamp-divider')
    ) ? existingFirstChild.textContent.trim() : null;
 
    
    // 将消息数组倒序处理，最新的消息在前
    processedMessages.reverse().forEach(function(data, index) {
        // 决定是否显示时间戳
        let showTimestamp = false;
        
        if (index === 0) {
            // 仅当这条旧消息的格式化时间，与顶部已有的时间戳不同时才显示
            const formattedTime = formatHistoricalTimestamp(data);
            showTimestamp = formattedTime !== existingFirstTimestamp;
        } 
        else {
            // 直接比较当前消息和上一条消息的分钟值
            const prevMsg = processedMessages[index - 1];
            const currMinute = Math.floor(data.timestamp_data.timestamp / 60);
            const prevMinute = Math.floor(prevMsg.timestamp_data.timestamp / 60);
            
            showTimestamp = currMinute !== prevMinute;
        }
        
        // 避免连续添加时间戳分隔符
        if (showTimestamp && lastAddedType !== 'timestamp') {
            const formattedTime = formatHistoricalTimestamp(data);
            const timestampDiv = document.createElement('div');
            timestampDiv.className = 'timestamp-divider';
            timestampDiv.innerHTML = `<span>${formattedTime}</span>`;
            tempContainer.appendChild(timestampDiv);
            lastAddedType = 'timestamp';
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
        
        tempContainer.appendChild(messageItem);
        lastAddedType = 'message';
    });
    
    // 将新消息插入到消息列表顶部
    while (tempContainer.firstChild) {
        messagesList.insertBefore(tempContainer.firstChild, messagesList.firstChild);
    }
    
    // 保持滚动位置
    const newScrollHeight = messagesList.scrollHeight;
    messagesList.scrollTop = scrollTop + (newScrollHeight - scrollHeight);
}

/**
 * 扩展消息的时间戳信息（前端版本，用于备用）
 * @param {Object} message - 消息对象
 * @returns {Object} 包含完整时间戳信息的消息对象
 */
function expandMessageTimestamp(message) {
    if (message.timestamp_data) {
        return message; // 已经有完整时间信息
    }
    
    let timestamp;
    let date;
    
    // 优先使用 ts 字段（Unix时间戳）
    if (message.ts) {
        timestamp = message.ts;
        date = new Date(timestamp * 1000);
    } else if (message.timestamp) {
        // 兼容旧的字符串格式
        date = new Date(message.timestamp);
        timestamp = Math.floor(date.getTime() / 1000);
    } else {
        // 默认使用当前时间
        date = new Date();
        timestamp = Math.floor(date.getTime() / 1000);
    }
    
    // 确保时区为北京时间
    const beijingDate = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Shanghai"}));
    
    // 生成完整时间信息
    message.timestamp_data = {
        full: beijingDate.getFullYear() + '-' + 
              String(beijingDate.getMonth() + 1).padStart(2, '0') + '-' + 
              String(beijingDate.getDate()).padStart(2, '0') + ' ' +
              String(beijingDate.getHours()).padStart(2, '0') + ':' +
              String(beijingDate.getMinutes()).padStart(2, '0') + ':' +
              String(beijingDate.getSeconds()).padStart(2, '0'),
        date: beijingDate.getFullYear() + '-' + 
              String(beijingDate.getMonth() + 1).padStart(2, '0') + '-' + 
              String(beijingDate.getDate()).padStart(2, '0'),
        time: String(beijingDate.getHours()).padStart(2, '0') + ':' +
              String(beijingDate.getMinutes()).padStart(2, '0'),
        year: beijingDate.getFullYear(),
        month: beijingDate.getMonth() + 1,
        day: beijingDate.getDate(),
        weekday: beijingDate.getDay() === 0 ? 7 : beijingDate.getDay(),
        hour: beijingDate.getHours(),
        minute: beijingDate.getMinutes(),
        second: beijingDate.getSeconds(),
        timestamp: timestamp
    };
    
    return message;
}