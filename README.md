# 乐学日程 Skill

一个轻量、可脚本化的北京理工大学乐学（Lexue）日程获取工具。通过 SSO 登录拿到会话，再从日历导出接口获取 iCal 并解析为结构化事件。

## 特性

- 纯 Node.js（无需 Playwright）
- 支持 SSO 登录、日历导出与解析
- 输出 JSON，便于二次处理

## 环境要求

- Node.js 18+（使用内置 `fetch`）
- 可访问 `https://sso.bit.edu.cn` 与 `https://lexue.bit.edu.cn`

## 安装

```bash
npm install
```

## 使用

登录：

```bash
node lexue-client.js login --username 学号 --password 密码
```

获取日程（未来 7 天）：

```bash
node lexue-client.js schedule --days 7 --username 学号 --password 密码
```

仅获取日程（使用已保存的 Cookie）：

```bash
node lexue-client.js schedule --days 7
```

## 输出说明

- 输出为 JSON：`count` 为事件数量，`events` 为事件数组
- 时间为 ISO 字符串（UTC）

## 致谢与引用

SSO 登录与乐学日程获取流程参考并致谢：

```
https://github.com/BIT101-dev/BIT101-Android
```
