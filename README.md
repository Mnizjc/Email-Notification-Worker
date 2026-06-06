# 邮件通知服务 · Cloudflare Worker + Resend

这是一个基于 **Cloudflare Workers** 和 **Resend** 的轻量级邮件发送服务。通过简单的 HTTP 请求即可发送通知邮件，支持纯文本/HTML 内容、抄送/密送，并内置 **Bearer Token 认证**，防止接口被滥用。

## ✨ 主要特性

- 📧 **发送邮件** – 通过 Resend 可靠投递，发件地址固定为 `notification@your-domain`。
- 🔐 **认证保护** – 请求需携带 `Authorization: Bearer <token>`，有效防止未授权调用。
- 📝 **双格式支持** – 同时支持 `application/json` 和表单（`urlencoded`/`multipart`）请求。
- 🧪 **自带测试页** – 提供友好的交互式文档页面（`DOC.html`），可直接在线测试接口。
- 🌐 **跨域友好** – 已配置 CORS，方便前端页面直接调用。

## 🚀 快速开始

### 1. 部署到 Cloudflare Workers

```bash
# 克隆仓库
git clone https://github.com/yourname/email-notification-worker.git
cd email-notification-worker

# 安装依赖
npm install

# 配置环境变量（编辑 wrangler.jsonc 或使用 wrangler secret）
# - WORKER_EMAIL: 固定发件邮箱（如 notification@example.com）
# - RESEND_API_KEY: Resend 的 API Key
# - API_TOKEN: 你的 Bearer Token（自定义，用于接口认证）

# 部署
npm run deploy
```

> 或者新建worker的时候直接导入库也可以？这个我倒是没试过。

### 2. 发送测试邮件

```bash
curl -X POST https://your-worker.dev/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{
    "from": "告警系统",
    "to": "admin@example.com",
    "subject": "服务状态",
    "text": "一切正常"
  }'
```

### 3. 使用在线测试页

访问 `https://your-worker.dev/` 或 `/send` 打开可视化文档，填写表单即可发送。

## 📁 项目结构

```
.
├── src/
│   └── index.ts          # Worker 主逻辑（Hono 路由、认证、邮件发送）
├── public/
│   └── DOC.html          # 交互式 API 文档与测试工具
├── wrangler.jsonc        # Cloudflare 配置（变量、路由等）
└── package.json
```

## 🔧 环境变量

| 变量名           | 说明                                 |
| ---------------- | ------------------------------------ |
| `WORKER_EMAIL`   | 发件邮箱地址（固定）                 |
| `RESEND_API_KEY` | Resend API 密钥                      |
| `API_TOKEN`      | Bearer 认证令牌（自行设定，请妥善保管） |

> 生产环境建议使用 `wrangler secret put <NAME>` 加密存储。

## 📖 API 文档

- `POST /send` – 发送邮件（需认证）
- `GET /` 或 `/send` – 返回测试页面（公开，无需认证）

详细参数说明请查看部署后的文档页面或仓库中的 `DOC.html`。

## 🤝 许可

MIT License

---

欢迎提 Issue 或 PR。如果你觉得这个项目有用，请给个 ⭐️ 支持一下！
