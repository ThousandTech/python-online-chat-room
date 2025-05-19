"""测试Falsk
访问127.0.0.1:5000时返回字符串"Hello, World!"
"""
from flask import Flask #导入Flask类
app = Flask(__name__) #创建对象，参数为固定写法

@app.route('/')#路由装饰器,作用为浏览器试图访问根目录'/'时立刻调用下面的hello()函数
def hello():
    return 'Hello, World!'

if __name__ == '__main__':#仅在直接运行时app.py时运行此部分
    app.run(debug=True)#在本地127.0.0.1:5000上启动服务器
