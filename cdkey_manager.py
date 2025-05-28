# cdkey_manager.py (调试增强版)
import json
import os
import hashlib
import secrets
import string
import threading
from datetime import datetime

CDKEYS_FILE = 'data/cdkeys/cdkeys.json'
CDKEYS_LOCK = threading.Lock()

class CDKeyManager:
    """
    注册密钥管理器，负责生成、验证和删除注册密钥
    """
    def __init__(self, cdkeys_file=CDKEYS_FILE):
        self.cdkeys_file = cdkeys_file
        self._ensure_directory()
    
    def _ensure_directory(self):
        """确保cdkeys目录存在"""
        os.makedirs(os.path.dirname(self.cdkeys_file), exist_ok=True)
    
    def _load_cdkeys(self):
        """
        从文件加载注册密钥哈希值
        Returns:
            set: 密钥哈希值集合
        """
        if not os.path.exists(self.cdkeys_file):
            print(f"[DEBUG] 密钥文件不存在: {self.cdkeys_file}")
            return set()
        
        try:
            with open(self.cdkeys_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                cdkey_hashes = set(data.get('cdkey_hashes', []))
                print(f"[DEBUG] 成功加载 {len(cdkey_hashes)} 个密钥哈希")
                return cdkey_hashes
        except Exception as e:
            print(f"[ERROR] 加载注册密钥失败: {e}")
            return set()
    
    def _save_cdkeys(self, cdkey_hashes):
        """
        保存注册密钥哈希值到文件
        Args:
            cdkey_hashes (set): 密钥哈希值集合
        """
        data = {
            'cdkey_hashes': list(cdkey_hashes),
            'last_updated': datetime.now().isoformat()
        }
        
        try:
            with open(self.cdkeys_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
            print(f"[DEBUG] 成功保存 {len(cdkey_hashes)} 个密钥哈希")
        except Exception as e:
            print(f"[ERROR] 保存注册密钥失败: {e}")
    
    def _hash_cdkey(self, cdkey):
        """
        对注册密钥进行哈希
        Args:
            cdkey (str): 原始密钥
        Returns:
            str: 哈希值
        """
        # 统一转换为大写，确保一致性
        normalized_cdkey = cdkey.upper().strip()
        hash_value = hashlib.sha256(normalized_cdkey.encode('utf-8')).hexdigest()
        print(f"[DEBUG] 密钥 '{normalized_cdkey}' 的哈希值: {hash_value[:8]}...")
        return hash_value
    
    def generate_cdkey(self):
        """
        生成一个新的注册密钥
        Returns:
            str: 新生成的密钥
        """
        # 生成16位随机密钥，包含大小写字母和数字
        characters = string.ascii_uppercase + string.digits  # 只使用大写字母和数字
        cdkey = ''.join(secrets.choice(characters) for _ in range(10))
        print(f"[DEBUG] 生成新密钥: {cdkey}")
        return cdkey
    
    def add_cdkeys(self, count=10):
        """
        生成并添加指定数量的注册密钥
        Args:
            count (int): 要生成的密钥数量
        Returns:
            list: 生成的明文密钥列表
        """
        print(f"[DEBUG] 开始生成 {count} 个密钥")
        with CDKEYS_LOCK:
            cdkey_hashes = self._load_cdkeys()
            new_cdkeys = []
            
            for i in range(count):
                cdkey = self.generate_cdkey()
                cdkey_hash = self._hash_cdkey(cdkey)
                cdkey_hashes.add(cdkey_hash)
                new_cdkeys.append(cdkey)
                print(f"[DEBUG] 生成密钥 {i+1}/{count}: {cdkey}")
            
            self._save_cdkeys(cdkey_hashes)
            print(f"[DEBUG] 完成生成 {len(new_cdkeys)} 个密钥")
            return new_cdkeys
    
    def verify_and_consume_cdkey(self, cdkey):
        """
        验证注册密钥并在验证成功后删除
        Args:
            cdkey (str): 要验证的密钥
        Returns:
            bool: 验证是否成功
        """
        if not cdkey:
            print("[DEBUG] 密钥为空")
            return False
        
        normalized_cdkey = cdkey.upper().strip()
        print(f"[DEBUG] 验证并消耗密钥: {normalized_cdkey}")
        
        cdkey_hash = self._hash_cdkey(normalized_cdkey)
        
        with CDKEYS_LOCK:
            cdkey_hashes = self._load_cdkeys()
            print(f"[DEBUG] 当前可用密钥数量: {len(cdkey_hashes)}")
            
            if cdkey_hash in cdkey_hashes:
                # 验证成功，删除该密钥
                cdkey_hashes.remove(cdkey_hash)
                self._save_cdkeys(cdkey_hashes)
                print(f"[DEBUG] 密钥验证成功并已消耗，剩余: {len(cdkey_hashes)}")
                return True
            else:
                print(f"[DEBUG] 密钥无效或已被使用")
                return False
    
    def verify_cdkey_only(self, cdkey):
        """
        仅验证注册密钥是否有效（不消耗）
        Args:
            cdkey (str): 要验证的密钥
        Returns:
            bool: 验证是否成功
        """
        if not cdkey:
            print("[DEBUG] 密钥为空")
            return False
        
        normalized_cdkey = cdkey.upper().strip()
        print(f"[DEBUG] 仅验证密钥: {normalized_cdkey}")
        
        cdkey_hash = self._hash_cdkey(normalized_cdkey)
        
        with CDKEYS_LOCK:
            cdkey_hashes = self._load_cdkeys()
            is_valid = cdkey_hash in cdkey_hashes
            print(f"[DEBUG] 密钥验证结果: {'有效' if is_valid else '无效'}")
            return is_valid
    
    def get_remaining_count(self):
        """
        获取剩余可用密钥数量
        Returns:
            int: 剩余密钥数量
        """
        with CDKEYS_LOCK:
            cdkey_hashes = self._load_cdkeys()
            count = len(cdkey_hashes)
            print(f"[DEBUG] 剩余密钥数量: {count}")
            return count
    
    def list_all_cdkeys(self):
        """
        列出所有可用密钥（仅用于调试）
        Returns:
            list: 密钥哈希列表
        """
        with CDKEYS_LOCK:
            cdkey_hashes = self._load_cdkeys()
            print(f"[DEBUG] 所有密钥哈希: {list(cdkey_hashes)}")
            return list(cdkey_hashes)

def save_cdkeys_to_file(cdkeys, filename=None):
    """
    将明文密钥保存到txt文件
    """
    if filename is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'cdkeys_{timestamp}.txt'
    
    output_dir = 'data/cdkeys'
    os.makedirs(output_dir, exist_ok=True)
    filepath = os.path.join(output_dir, filename)
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"注册密钥列表 - 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 50 + "\n\n")
            
            for i, cdkey in enumerate(cdkeys, 1):
                f.write(f"{i:2d}. {cdkey}\n")
            
            f.write(f"\n总计: {len(cdkeys)} 个密钥\n")
            f.write("注意: 每个密钥只能使用一次！\n")
        
        print(f"[DEBUG] 密钥已保存到: {filepath}")
        return filepath
    except Exception as e:
        print(f"[ERROR] 保存密钥文件失败: {e}")
        return None

# 调试工具函数
def debug_cdkey_system():
    """
    调试密钥系统
    """
    print("=== 密钥系统调试 ===")
    manager = CDKeyManager()
    
    # 检查文件状态
    print(f"密钥文件路径: {manager.cdkeys_file}")
    print(f"文件是否存在: {os.path.exists(manager.cdkeys_file)}")
    
    # 检查剩余密钥
    remaining = manager.get_remaining_count()
    print(f"剩余密钥数量: {remaining}")
    
    if remaining == 0:
        print("没有可用密钥，正在生成...")
        cdkeys = manager.add_cdkeys(5)
        save_cdkeys_to_file(cdkeys, "debug_cdkeys.txt")
    
    # 列出所有密钥哈希
    manager.list_all_cdkeys()

if __name__ == '__main__':
    if len(os.sys.argv) > 1 and os.sys.argv[1] == 'debug':
        debug_cdkey_system()
    else:
        print("正在生成注册密钥...")
        manager = CDKeyManager()
        cdkeys = manager.add_cdkeys(10)
        
        filepath = save_cdkeys_to_file(cdkeys)
        
        if filepath:
            print(f"成功生成 {len(cdkeys)} 个注册密钥")
            print(f"密钥已保存到: {filepath}")
            print(f"当前剩余可用密钥数量: {manager.get_remaining_count()}")
        else:
            print("密钥生成失败")