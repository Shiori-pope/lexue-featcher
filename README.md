# 乐学日程查询工具 (Lexue Schedule Skill)

一个为 AI Agent 设计的、轻量级、可脚本化的北京理工大学乐学（Lexue）日程获取技能 (Skill)。本项目通过北理统一身份认证 (SSO) 登录获取会话，并调用日历导出接口获取 iCal 数据，最终将其解析为结构化的 JSON 事件数据，方便 AI Agent 直接读取与处理。

## 特性

- **轻量无头依赖**：纯 Node.js 实现，无需依赖 Playwright/Puppeteer 等繁重的无头浏览器，非常适合作为 Agent 工具运行。
- **全链路解析**：无缝完成 `SSO 登录 -> 日历导出 -> iCal 解析 -> JSON 结构化` 的完整流程。
- **结构化输出**：直接输出标准 JSON 格式数据，极大降低 AI Model 解析和后续处理与数据展示的成本。
- **网络代理友好**：原生支持 `HTTP_PROXY` 与 `HTTPS_PROXY` 环境变量配置网络请求。

## 环境要求

- **Node.js**: v18 及以上版本（依赖内置的 `fetch` API）。
- **网络访问**: 所在网络环境需能正常访问北理 SSO 与乐学平台（`https://sso.bit.edu.cn` 与 `https://lexue.bit.edu.cn`）。

## 安装

1. 确保已安装 Node.js 18+ 环境。
2. 在项目根目录执行以下命令安装依赖：

```bash
npm install
```

## 使用指南

工具提供了直观的命令行选项，支持账号密码直连以及基于 Cookie 的会话保持机制。

### 1. 登录并缓存会话

初次使用或会话过期时，可使用学号与密码登录。成功后，Cookie 会持久化保存在本地以供后续命令使用：

```bash
node lexue-client.js login --username <您的学号> --password <您的密码>
```

### 2. 获取日程数据

**推荐用法**（利用已保存的会话，获取未来 30 天日程）：

```bash
node lexue-client.js schedule --days 30
```

**单次直连**（未缓存会话时，也可在请求时直接出示身份凭证）：

```bash
node lexue-client.js schedule --days 30 --username <您的学号> --password <您的密码>
```

### 3. 查看当前登录状态

检查本地保存的会话状态是否仍有效：

```bash
node lexue-client.js status
```

## 环境变量

如果所在网络需要通过代理访问目标服务器，可通过设置环境变量进行配置：

```bash
# Windows (PowerShell)
$env:HTTP_PROXY="http://127.0.0.1:7890"

# Linux / macOS
export HTTP_PROXY="http://127.0.0.1:7890"
```

## 输出规范说明

执行日程获取命令后，工具会将信息格式化为标准 JSON 数据输出到终端，方便大语言模型或应用读取：
- **`count`**: 返回的事件总数。
- **`events`**: 事件数组。包含课程/日程的标题、开始时间、结束时间等字段。
- **时间格式**: 所有时间全部转化为标准 ISO-8601 字符串（UTC 0 时区）。
- **时间过滤**: 命令中的“未来 N 天”过滤规则，以本机当前本地时间作为动态计算的基准。

## 数据与隐私安全

- **本地存储**: 登录成功后，程序会在当前脚本所在目录下隐式写入 `.lexue-cookies.json` 文件用于缓存会话 Cookie。
- **敏感信息警告**: 此缓存文件包含可直接越权访问您乐学账户的敏感会话凭证。严禁将该文件提交至任何版本库，请确保其已被加入项目的 `.gitignore` 中。

## License

MIT

## 致谢与引用

本项目的 SSO 登录分析与乐学日程获取相关流程参考了以下优秀且活跃的开源项目，并受到启发，在此表示致谢：

- [BIT101-Android](https://github.com/BIT101-dev/BIT101-Android)
