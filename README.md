# 只会一点｜AI 学习陪伴

“只会一点”是一个温和、循序渐进的 AI 学习陪伴项目。它不只回答问题，还会把对话中形成的知识点整理为学习记忆，通过复习、练习和纠错帮助用户逐步掌握内容。

## 主要功能

- 引导、直接、溯源三种对话模式
- 结构化知识点和薄弱点记录
- 学习画像与自适应讲解
- 今日回顾、自动出题和答案评估
- 知识点修改、合并、删除与判定异议
- 浏览器语音输入、单条朗读和自动朗读
- 使用本地 KaTeX 渲染数学公式

## 技术栈

- Python、Flask、SQLite
- DeepSeek Chat API（通过 OpenAI Python SDK 调用）
- 原生 JavaScript、HTML 和 CSS
- KaTeX

## 本地运行

1. 安装依赖：

   ```bash
   pip install -r requirements.txt
   ```

2. 创建本地环境配置：

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell 可使用：

   ```powershell
   Copy-Item .env.example .env
   ```

3. 在 `.env` 中填写自己的 `DEEPSEEK_API_KEY`。

4. 启动应用：

   ```bash
   python app.py
   ```

5. 打开 `http://127.0.0.1:5000/`。

## 测试

```bash
python -m unittest -v
```

## 数据与隐私

- API 密钥只应保存在本地 `.env` 文件中。
- 对话、学习画像、知识点和练习记录保存在本地 `data/` 目录中。
- `.env`、`data/`、日志、IDE 配置和缓存均已通过 `.gitignore` 排除，不应提交到公开仓库。
- 浏览器语音识别可能由浏览器提供商的在线服务处理，请根据实际部署环境补充隐私说明。

## 项目结构

```text
app.py                 Flask API、模型调用和学习数据逻辑
templates/index.html   主页面
stastic/js/script.js   前端交互逻辑
stastic/css/style.css  页面样式
stastic/vendor/katex/  本地数学公式渲染资源
test_app.py            自动化测试
```

> `stastic` 是当前项目使用的静态资源目录名称，并在 Flask 初始化时显式配置。
