# 📬 Outlook 邮件管理（服务器自部署版）

<div align="center">

**基于 Node.js + SQLite + Docker 的 Outlook 邮件管理工具（Hono 框架）**

🖥️ 自托管 · 🐳 Docker 部署 · 💾 SQLite 存储 · 🌗 深浅主题 · 🌐 中英双语

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4-E36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Node](https://img.shields.io/badge/Node.js-22+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://docker.com/)

</div>

> ⚠️ 本项目是 [roseforyou/cf-outlook-email](https://github.com/roseforyou/cf-outlook-email) 的**服务器自部署版**：
> 将原本运行在 Cloudflare Workers 上的应用改造为可在你自己的服务器上运行。
> 数据存储在本机 SQLite，不再依赖 Cloudflare 账户。

---

## ✨ 特性

- 🔐 **一键授权** — 浏览器弹窗登录微软账号，自动获取凭证，无需手动复制 token
- 🔄 **Token 自动续期** — 内置定时任务自动刷新 token，只要定期使用就不会过期
- 📦 **批量管理** — 批量导入/导出/删除/移组，支持单条与选中导出、分组和状态筛选
- 📂 **文件导入** — 支持点击选择或拖拽 `.txt` / `.csv` 文件批量导入，多次拖拽自动追加
- 📨 **邮件阅读** — 通过 Microsoft Graph API 实时读取，支持收件箱/垃圾箱/已删除文件夹切换、聚合视图、分页加载、搜索和 HTML 渲染
- 📭 **临时邮箱** — 集成 GPTMail API，一键生成临时邮箱接收邮件
- 🎨 **精致主题** — 深色/浅色/跟随系统，毛玻璃质感 + 圆形扫掠切换 + 低频呼吸光晕
- 🌐 **中英双语** — 默认中文，顶栏一键切换 English，偏好本地记忆，后端消息同步翻译
- 💾 **数据自持** — SQLite 存在 Docker 卷中，数据完全归你所有

## 🚀 Docker 部署

### 前置要求

- Docker 20.10+ 与 Docker Compose v2
- Node.js 22+（仅构建/开发时需要，运行时在容器内）

### 快速开始

```bash
# 1. 克隆
git clone https://github.com/Superluckyli/cf-outlook-email-server.git
cd cf-outlook-email-server

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置 ADMIN_PASSWORD（登录密码）和 COOKIE_SECRET（至少 32 位随机串）

# 3. 构建并启动
docker compose up -d --build

# 4. 访问
# http://<你的服务器IP>:8787
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `ADMIN_PASSWORD` | ✅ | - | 管理面板登录密码 |
| `COOKIE_SECRET` | ✅ | - | 会话签名密钥（至少 32 位随机字符） |
| `GPTMAIL_API_KEY` | ❌ | - | GPTMail API Key（临时邮箱功能） |
| `PORT` | ❌ | `8787` | 监听端口 |
| `DB_PATH` | ❌ | `/data/outlook-email.db` | SQLite 数据库文件路径 |
| `CRON_INTERVAL_MS` | ❌ | `21600000` | Token 刷新定时任务间隔（毫秒，默认 6 小时） |

### 反向代理（推荐）

生产环境建议用 Caddy / Nginx 提供 HTTPS 反代：

```caddyfile
# Caddy 示例
otp.example.com {
    reverse_proxy outlook-email:8787
}
```

## 🔄 从 Cloudflare 版迁移

两版代码完全同源（同一套路由与前端），差异仅在运行时：

| | Cloudflare 版 | 本仓库（服务器版） |
|---|---|---|
| 运行时 | Cloudflare Workers | Node.js 22 |
| 数据库 | Cloudflare D1 | SQLite（`node:sqlite` 内置） |
| 静态文件 | Cloudflare Assets | `public/` 目录直出 |
| 定时任务 | `scheduled` cron trigger | 进程内 `setInterval` |
| 数据归属 | Cloudflare 账户 | 你的服务器 |

> 💡 数据库不兼容：D1 与本地 SQLite 是两套独立数据，账号需重新导入。

## 🧱 技术栈

| 层 | 技术 |
|---|---|
| ⚙️ 运行时 | Node.js 22 + Hono |
| 🗄️ 数据库 | SQLite（`node:sqlite`，通过 D1 兼容适配层 `src/server-db.ts`） |
| 📄 模板 | 原生 HTML/JS/CSS（`public/`） |
| 🐳 部署 | Docker + Docker Compose |
| 📨 邮件 | Microsoft Graph API（OAuth2 refresh_token） |

## 📁 项目结构

```
├── src/
│   ├── server.ts          # Node 服务器入口（静态文件 + API + 定时任务）
│   ├── server-db.ts       # D1 兼容 SQLite 适配层
│   ├── db.ts              # 数据库辅助函数（query/first/run/batch）
│   ├── routes/            # API 路由（auth/accounts/emails/groups/tags...）
│   ├── graph.ts           # Microsoft Graph API 客户端
│   ├── cron.ts            # Token 刷新 + 新邮件推送定时任务
│   └── auth.ts            # 会话认证中间件
├── public/                # 前端静态文件
├── migrations/            # 数据库迁移 SQL
├── Dockerfile
└── docker-compose.yml
```

## 🔧 本地开发

```bash
pnpm install
export ADMIN_PASSWORD=test123 COOKIE_SECRET=your_secret_here
pnpm run serve
# 访问 http://localhost:8787
```

## 📮 添加邮箱

登录后点击 **添加账号** → **一键授权** → 弹出微软登录窗口 → 授权后自动填入凭证 → 保存。

支持所有 Outlook / Hotmail / Live 邮箱，也支持批量导入（格式：`邮箱----密码----client_id----refresh_token`），或直接拖拽文件导入。

## 🐛 常见问题

**Q: 转圈/加载慢？**
A: 查看邮件时需实时调用微软 Graph API，网络到微软服务慢时会有延迟，属正常现象。

**Q: 如何备份数据？**
A: 备份 Docker 卷 `outlook-email-data`（或直接复制 `/data/outlook-email.db` 文件）。

**Q: 支持中文吗？**
A: 支持，默认中文界面，顶栏可切换英文。

## 📄 许可

[GPL-3.0](./LICENSE)

## 🙏 致谢

前端与业务逻辑源自 [roseforyou/cf-outlook-email](https://github.com/roseforyou/cf-outlook-email)（GPL-3.0），本仓库为服务器自部署适配版。
