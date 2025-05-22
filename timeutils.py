from datetime import datetime, timedelta, timezone

def get_iso_timestamp():
    """
    此函数返回当前时间的 ISO 8601 格式字符串（UTC时间，带Z后缀）。
    Returns:
        str: ISO 8601格式的UTC时间字符串
    """
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

def get_beijing_timestamp():
    """
    此函数返回当前中国北京时间的格式化字符串。
    Returns:
        str: 格式如 2025-05-22 18:52:37 的北京时间字符串
    """
    now = datetime.now(timezone(timedelta(hours=8)))
    return now.strftime("%Y-%m-%d %H:%M:%S")

def get_message_timestamp(time_str=None):
    """
    此函数获取消息时间戳，生成用于消息显示的时间信息。
    \n可以处理传入的时间字符串或使用当前时间。
    Args:
        time_str (str, optional): 时间字符串，默认为None表示使用当前时间
    Returns:
        dict: 包含完整时间戳信息的字典，便于前端灵活处理时间展示
    """
    if time_str:
        now = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
        now = now.replace(tzinfo=timezone(timedelta(hours=8)))
    else:
        now = datetime.now(timezone(timedelta(hours=8)))
    
    timestamp = {
        'full': now.strftime("%Y-%m-%d %H:%M:%S"),  # 完整时间
        'date': now.strftime("%Y-%m-%d"),  # 日期部分
        'time': now.strftime("%H:%M"),  # 时间部分
        'year': now.year,  # 年
        'month': now.month,  # 月
        'day': now.day,  # 日
        'weekday': now.weekday() + 1,  # 星期几（1-7）
        'hour': now.hour,  # 小时
        'minute': now.minute,  # 分钟
        'second': now.second,  # 秒
        'timestamp': int(now.timestamp()),  # Unix时间戳
    }
    
    return timestamp