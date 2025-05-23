var socket = io();
var currentUser = null;
var lastTimestamp = null; // 存储上一条消息的时间戳
var emojiPickerVisible = false;

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

// 监听收到消息
socket.on('message', function(data){
    // 检查是否需要显示时间戳标记
    const showTimestamp = !lastTimestamp || !isSameMinute(data, lastTimestamp);
    
    // 如果需要显示时间戳，先添加一个时间戳分隔符
    if (showTimestamp) {
        const formattedTime = formatTimestamp(data);
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'timestamp-divider';
        timestampDiv.innerHTML = `<span>${formattedTime}</span>`;
        document.getElementById('messages').appendChild(timestampDiv);
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
    messageBubble.innerHTML = data.msg;
    messageItem.appendChild(messageBubble);
    
    // 将消息项添加到消息列表
    document.getElementById('messages').appendChild(messageItem);
    
    // 更新上一条消息的时间戳
    lastTimestamp = data;
    
    scrollToBottom();
});

/**
 * 此函数发送消息到服务器。
 */
function sendMessage() {
    var input = document.getElementById('myMessage');
    var msg = input.value.trim();
    if(msg !== "" && currentUser) {
        socket.emit('message', {
            username: currentUser,
            msg: msg
        });
        input.value = '';
    }
}

/**
 * 此函数自动滚动消息区域到底部。
 */
function scrollToBottom() {
    var messages = document.getElementById('messages');
    messages.scrollTop = messages.scrollHeight;
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
 * 此函数处理历史消息并添加时间戳分隔。
 * @param {Array} messages - 消息列表
 */
function processHistoricalMessages(messages) {
    const messagesList = document.getElementById('messages');
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
        messageBubble.innerHTML = data.msg;
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
    fetch('/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            username: document.getElementById('login_user').value,
            password: document.getElementById('login_pass').value
        })
    })
    .then(r => r.json())
    .then(data => {
        document.getElementById('loginMsg').textContent = data.msg;
        if(data.success){
            currentUser = document.getElementById('login_user').value;
            document.getElementById('pageTitle').style.display = 'none';
            document.getElementById('loginArea').style.display = 'none';
            document.getElementById('registerArea').style.display = 'none';
            document.getElementById('chatPanel').style.display = '';
            // 拉取历史消息
            fetch('messages')
                .then(res => res.json())
                .then(msgs => {
                    processHistoricalMessages(msgs);
                });
        }
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

// 当文档加载完成后初始化emoji选择器
document.addEventListener('DOMContentLoaded', function() {
    // 配置emoji选择器事件
    const emojiPicker = document.querySelector('emoji-picker');
    
    emojiPicker.addEventListener('emoji-click', event => {
        const myMessage = document.getElementById('myMessage');
        myMessage.value += event.detail.unicode;
        myMessage.focus();
    });
    
    // 按回车键发送消息（Enter 发送，Shift+Enter 换行）
    document.getElementById('myMessage').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
        // Shift+Enter 允许换行
    });
});