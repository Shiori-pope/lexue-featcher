---
name: lexue-schedule
description: 北京理工大学乐学平台日程查询
metadata: {"clawdbot":{"emoji":"📅", "requires":{"bins":["node"]}, "install":[{"id":"npm","kind":"local","cmd":"cd ~/projects/lexue-featcher && npm install","label":"安装依赖"}]}}
---

# 乐学日程查询

## 触发条件

当用户说以下内容时调用此技能：
- "查乐学日程"
- "查一下乐学"
- "乐学有什么作业"
- "查北理工日程"
- "乐学课程表"
- 或其他关于北京理工大学乐学平台课程表、日程、作业的查询

## 用途

查询北理工乐学平台的课程表和日程，获取未来 N 天的课程安排。

## 前提条件

- Node.js 18+
- 项目位于 ~/projects/lexue-featcher/

## 使用方法

### 查询日程

```bash
node lexue-client.js schedule --days 30
```

参数：
- `--days N`：查询未来 N 天的日程（默认 30 天）

### 登录

```bash
node lexue-client.js login --username <学号> --password <密码>
```

首次使用需要登录，登录后 cookie 会缓存到本地。

### 检查状态

```bash
node lexue-client.js status
```

检查当前登录状态和 cookie 是否有效。

## 输出

JSON 格式的日程数据，包含课程名称、上课时间、上课地点等信息。

## 错误处理

### 会话过期

如果遇到会话过期错误（401 Unauthorized 或类似认证失败提示）：

1. 删除本地缓存的 cookie：
   ```bash
   rm -f ~/.lexue-cookies.json
   ```

2. 重新登录：
   ```bash
   node lexue-client.js login --username <学号> --password <密码>
   ```

3. 重新查询日程

### 其他错误

- 网络错误：检查网络连接后重试
- 项目路径错误：确保在 ~/projects/lexue-featcher/ 目录下执行命令

## 注意事项

- 首次使用需要先登录
- cookie 会自动缓存，无需每次输入密码
- 会话过期时需要重新登录
