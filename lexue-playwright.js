#!/usr/bin/env node

/**
 * 乐学日程查询客户端 - 使用 Playwright 登录
 * 北京理工大学乐学平台 API 封装
 */

import { chromium } from 'playwright';
import ICAL from 'ical.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LEXUE_URL = 'https://lexue.bit.edu.cn';
const SSO_URL = 'https://sso.bit.edu.cn';
const COOKIE_FILE = path.join(__dirname, '.lexue-cookies.json');

// 乐学客户端
class LexueClient {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.cookies = {};
    this.loadCookies();
  }

  loadCookies() {
    try {
      if (fs.existsSync(COOKIE_FILE)) {
        const data = fs.readFileSync(COOKIE_FILE, 'utf-8');
        this.cookies = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载 Cookie 失败:', e.message);
    }
  }

  saveCookies(cookies) {
    try {
      this.cookies = {};
      cookies.forEach(cookie => {
        this.cookies[cookie.name] = cookie.value;
      });
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(this.cookies, null, 2));
    } catch (e) {
      console.error('保存 Cookie 失败:', e.message);
    }
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.context = await this.browser.newContext({
        cookies: Object.entries(this.cookies).map(([name, value]) => ({
          name,
          value,
          domain: '.bit.edu.cn'
        }))
      });
      this.page = await this.context.newPage();
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // SSO: 执行登录
  async login(username, password) {
    try {
      await this.initBrowser();

      console.log('正在打开登录页面...');
      await this.page.goto(`${SSO_URL}/cas/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载
      await this.page.waitForTimeout(3000);

      // 获取页面内容用于调试
      const content = await this.page.content();
      console.log('页面内容长度:', content.length);

      // 尝试查找输入框 - 根据实际页面结构
      // 用户名输入框有 name=username
      // 密码输入框没有 name 属性，但有 type=password
      await this.page.waitForSelector('input[name="username"]', { timeout: 30000 });
      await this.page.waitForSelector('input[type="password"]', { timeout: 30000 });

      console.log('正在填写用户名和密码...');

      // 填写用户名
      await this.page.fill('input[name="username"]', username);

      // 填写密码 - 使用 type=password 选择器
      await this.page.fill('input[type="password"]', password);

      // 验证填写的内容
      const filledUsername = await this.page.inputValue('input[name="username"]');
      const filledPassword = await this.page.inputValue('input[type="password"]');
      console.log('填写的用户名:', filledUsername);
      console.log('填写的密码长度:', filledPassword ? filledPassword.length : 0);

      // 点击登录按钮
      console.log('正在提交登录...');
      const submitBtn = await this.page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        // 尝试其他选择器
        await this.page.keyboard.press('Enter');
      }

      // 等待登录完成
      await this.page.waitForNavigation({ timeout: 30000 }).catch(() => {});

      // 获取 cookies
      const cookies = await this.context.cookies();
      this.saveCookies(cookies);

      // 检查是否登录成功
      const currentUrl = this.page.url();
      console.log('登录后 URL:', currentUrl);

      const success = !currentUrl.includes('login') && currentUrl.includes('bit.edu.cn');
      if (success) {
        console.log('登录成功');
        return true;
      } else {
        // 获取页面内容检查错误
        const content = await this.page.content();
        if (content.includes('用户名或密码')) {
          console.log('登录失败: 用户名或密码错误');
        } else {
          console.log('登录失败: 未知错误');
        }
        return false;
      }
    } catch (e) {
      console.error('登录失败:', e.message);
      return false;
    }
  }

  // 乐学: 获取日历导出 URL
  async getCalendarUrl() {
    try {
      await this.initBrowser();

      // 访问乐学首页获取 sesskey
      console.log('正在访问乐学平台...');
      const response = await this.page.goto(LEXUE_URL, { waitUntil: 'networkidle' });

      const html = await this.page.content();

      // 从 HTML 中提取 sesskey
      const match = html.match(/["']sesskey["']:\s*["']([^"']+?)["']/);
      if (!match) {
        throw new Error('未找到 sesskey，可能未登录');
      }
      const sesskey = match[1];
      console.log('获取到 sesskey:', sesskey);

      // 访问日历导出页面
      console.log('正在获取日历...');
      await this.page.goto(`${LEXUE_URL}/calendar/export.php?sesskey=${sesskey}`, {
        waitUntil: 'networkidle'
      });

      // 填写表单并提交
      await this.page.fill('input[name="_qf__core_calendar_export_form"]', '1');
      await this.page.check('input[value="all"]');
      await this.page.selectOption('select[name="period[timeperiod]"]', 'recentupcoming');

      // 点击获取日历网址按钮
      await this.page.click('button:has-text("获取日历网址")');

      // 等待结果
      await this.page.waitForSelector('input[name="url"]', { timeout: 10000 });

      // 获取日历 URL
      const calendarUrl = await this.page.inputValue('input[name="url"]');
      console.log('获取到日历 URL:', calendarUrl);

      return calendarUrl;
    } catch (e) {
      throw new Error(`获取日历 URL 失败: ${e.message}`);
    }
  }

  // 获取并解析日历
  async fetchCalendar(calendarUrl) {
    try {
      // 直接用 axios 获取日历
      const axios = (await import('axios')).default;
      const response = await axios.get(calendarUrl);
      const icalData = response.data;

      // 解析 iCal 数据
      const jcalData = ICAL.parse(icalData);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      const events = vevents.map(vevent => {
        const event = new ICAL.Event(vevent);
        return {
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.startDate?.toJSDate()?.toISOString(),
          end: event.endDate?.toJSDate()?.toISOString(),
          categories: event.categories
        };
      });

      return events;
    } catch (e) {
      throw new Error(`获取日历失败: ${e.message}`);
    }
  }

  // 获取日程
  async getSchedule(days = 7) {
    try {
      // 1. 获取日历导出 URL
      const calendarUrl = await this.getCalendarUrl();

      // 2. 获取并解析日历
      const events = await this.fetchCalendar(calendarUrl);

      // 3. 过滤近期事件
      const now = new Date();
      const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const filteredEvents = events.filter(event => {
        if (!event.start) return false;
        const eventTime = new Date(event.start);
        return eventTime >= now && eventTime <= future;
      });

      await this.closeBrowser();

      return filteredEvents;
    } catch (e) {
      await this.closeBrowser();
      throw new Error(`获取日程失败: ${e.message}`);
    }
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  const client = new LexueClient();

  try {
    switch (action) {
      case 'login': {
        const usernameIdx = args.indexOf('--username');
        const passwordIdx = args.indexOf('--password');

        if (usernameIdx === -1 || passwordIdx === -1 || args[usernameIdx + 1] == null || args[passwordIdx + 1] == null) {
          console.error('用法: node lexue-playwright.js login --username 学号 --password 密码');
          process.exit(1);
        }

        const username = args[usernameIdx + 1];
        const password = args[passwordIdx + 1];
        await client.login(username, password);
        break;
      }

      case 'schedule': {
        const daysIdx = args.indexOf('--days');
        const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1]) : 7;

        const events = await client.getSchedule(days);
        console.log(JSON.stringify({
          success: true,
          count: events.length,
          days,
          events
        }, null, 2));
        break;
      }

      default:
        console.log('用法:');
        console.log('  node lexue-playwright.js login --username 学号 --password 密码');
        console.log('  node lexue-playwright.js schedule --days 7');
        break;
    }
  } catch (e) {
    console.error('错误:', e.message);
    await client.closeBrowser();
    process.exit(1);
  }
}

main();
