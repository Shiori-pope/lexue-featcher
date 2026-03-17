#!/usr/bin/env node

/**
 * 乐学日程查询客户端
 * 北京理工大学乐学平台 API 封装
 */

import * as cheerio from 'cheerio';
import CryptoJS from 'crypto-js';
import ICAL from 'ical.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProxyAgent } from 'undici';

// 获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置常量
const LEXUE_URL = 'https://lexue.bit.edu.cn';
const SSO_URL = 'https://sso.bit.edu.cn';
const COOKIE_FILE = path.join(__dirname, '.lexue-cookies.json');
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Cookie 管理
class CookieManager {
  constructor() {
    this.cookies = {};
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(COOKIE_FILE)) {
        const data = fs.readFileSync(COOKIE_FILE, 'utf-8');
        this.cookies = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载 Cookie 失败:', e.message);
    }
  }

  save() {
    try {
      fs.writeFileSync(COOKIE_FILE, JSON.stringify(this.cookies, null, 2));
    } catch (e) {
      console.error('保存 Cookie 失败:', e.message);
    }
  }

  toString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  updateFromSetCookie(setCookies) {
    if (!setCookies) return;
    const list = Array.isArray(setCookies) ? setCookies : [setCookies];
    list.forEach((cookie) => {
      const [nameValue] = cookie.split(';');
      const eqIndex = nameValue.indexOf('=');
      if (eqIndex === -1) return;
      const name = nameValue.slice(0, eqIndex).trim();
      const value = nameValue.slice(eqIndex + 1).trim();
      if (name) this.cookies[name] = value;
    });
  }

  has(name) {
    return this.cookies[name] != null;
  }

  hasAny(names) {
    return names.some((name) => this.has(name));
  }
}

// 乐学客户端
class LexueClient {
  constructor() {
    this.cookieManager = new CookieManager();
    this.sesskey = null;
    this.dispatcher = this.createDispatcherFromEnv();
  }

  createDispatcherFromEnv() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (!proxyUrl) return null;
    try {
      return new ProxyAgent(proxyUrl);
    } catch (e) {
      console.error('代理配置无效，将跳过代理:', e.message);
      return null;
    }
  }

  async request(url, options = {}) {
    const follow = options.redirect === 'follow';
    const maxRedirects = options.maxRedirects ?? 10;
    let currentUrl = url;
    let currentOptions = { ...options };

    for (let i = 0; i <= maxRedirects; i++) {
      const headers = {
        'User-Agent': USER_AGENT,
        ...(currentOptions.headers || {})
      };

      const cookie = this.cookieManager.toString();
      if (cookie) {
        headers['Cookie'] = cookie;
      }

      const fetchOptions = {
        ...currentOptions,
        headers,
        redirect: 'manual'
      };
      if (this.dispatcher) {
        fetchOptions.dispatcher = this.dispatcher;
      }

      const response = await fetch(currentUrl, fetchOptions);

      const setCookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [];
      if (setCookies.length > 0) {
        this.cookieManager.updateFromSetCookie(setCookies);
        this.cookieManager.save();
      }

      if (!follow || response.status < 300 || response.status >= 400) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      currentUrl = new URL(location, currentUrl).toString();

      if (response.status === 303) {
        currentOptions = { ...currentOptions, method: 'GET' };
        delete currentOptions.body;
        if (currentOptions.headers) {
          delete currentOptions.headers['Content-Type'];
        }
      }
    }

    throw new Error('redirect count exceeded');
  }

  // 加密密码 (AES/ECB/PKCS5Padding)
  encryptPassword(password, salt) {
    const decodedKey = Buffer.from(salt, 'base64');
    const key = CryptoJS.lib.WordArray.create(decodedKey);
    const encrypted = CryptoJS.AES.encrypt(password, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7
    });
    return encrypted.toString();
  }

  // SSO: 初始化登录
  async initLogin() {
    try {
      const response = await this.request(`${SSO_URL}/cas/login`, { redirect: 'manual' });
      const html = await response.text();

      const $ = cheerio.load(html);

      // 提取 salt (直接在 p 标签内)
      const salt = $('#login-croypto').text().trim();

      // 提取 execution (直接在 p 标签内)
      const execution = $('#login-page-flowkey').text().trim();

      // 提取其他隐藏字段
      const loginRuleType = $('#login-rule-type').text().trim();
      const currentLoginType = $('#current-login-type').text().trim();
      const riskSystemSwitch = $('#riskSystemSwitch').text().trim();

      const hasAuthCookie = this.cookieManager.hasAny(['SOURCEID_TGC', 'MOD_AUTH_CAS', 'CASTGC']);
      const hasLoginForm = Boolean(salt && execution);
      const ifLogin = hasAuthCookie && !hasLoginForm;

      return { salt, execution, ifLogin, loginRuleType, currentLoginType, riskSystemSwitch };
    } catch (e) {
      throw new Error(`初始化登录失败: ${e.message}`);
    }
  }

  // SSO: 执行登录
  async login(username, password) {
    try {
      // 1. 初始化登录
      const { salt, execution, ifLogin, loginRuleType, currentLoginType, riskSystemSwitch } = await this.initLogin();

      if (ifLogin) {
        console.log('已登录');
        return true;
      }

      if (!salt || !execution) {
        throw new Error('获取 salt 或 execution 失败');
      }

      // 2. 加密密码
      const cryptPassword = this.encryptPassword(password, salt);
      const captchaPayload = this.encryptPassword('{}', salt);

      // 3. 提交登录 (urlencoded)
      const formData = new URLSearchParams({
        username,
        password: cryptPassword,
        execution,
        croypto: salt,  // 注意拼写
        captcha_payload: captchaPayload,
        type: currentLoginType || 'UsernamePassword',
        geolocation: '',
        captcha_code: '',
        _eventId: 'submit',
        'login-rule-type': loginRuleType || 'normal',
        riskSystemSwitch: riskSystemSwitch || 'default'
      });

      const response = await this.request(`${SSO_URL}/cas/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${SSO_URL}/cas/login`
        },
        body: formData.toString()
      });

      // 4. 检查登录结果
      const html = await response.text();

      const hasAuthCookie = this.cookieManager.hasAny(['SOURCEID_TGC', 'MOD_AUTH_CAS', 'CASTGC']);
      const success = (response.status >= 300 && response.status < 400 && hasAuthCookie)
        || (html.indexOf('用户名密码') === -1 && hasAuthCookie)
        || html.indexOf('登录成功') !== -1;

      if (success) {
        console.log('登录成功');
        return true;
      }

      console.log('登录失败');
      return false;
    } catch (e) {
      console.error(`登录失败: ${e.message}`);
      return false;
    }
  }

  // 检查登录状态
  async checkStatus() {
    try {
      const { ifLogin } = await this.initLogin();
      return { loggedIn: ifLogin };
    } catch (e) {
      return { loggedIn: false, error: e.message };
    }
  }

  // 乐学: 获取 sesskey
  async getSesskey() {
    try {
      const response = await this.request(LEXUE_URL, { method: 'GET', redirect: 'follow' });
      const html = await response.text();

      // 从 HTML 中提取 sesskey
      const match = html.match(/["']sesskey["']:\s*["']([^"']+?)["']/);
      if (match) {
        this.sesskey = match[1];
        return this.sesskey;
      }
      throw new Error('未找到 sesskey');
    } catch (e) {
      throw new Error(`获取 sesskey 失败: ${e.message}`);
    }
  }

  // 乐学: 获取日历导出 URL
  async getCalendarUrl(sesskey) {
    try {
      const exportPage = await this.request(`${LEXUE_URL}/calendar/export.php?sesskey=${encodeURIComponent(sesskey)}`, {
        method: 'GET',
        redirect: 'follow'
      });
      const exportHtml = await exportPage.text();
      const $page = cheerio.load(exportHtml);
      const context = $page('input[name="context"]').val();
      const pageSesskey = $page('input[name="sesskey"]').val() || sesskey;

      const formData = new URLSearchParams({
        sesskey: pageSesskey,
        '_qf__core_calendar_export_form': '1',
        'events[exportevents]': 'all',
        'period[timeperiod]': 'recentupcoming',
        'generateurl': '获取日历网址'
      });
      if (context) {
        formData.set('context', String(context));
      }

      const exportAction = `${LEXUE_URL}/calendar/export.php?sesskey=${encodeURIComponent(pageSesskey)}`;
      const response = await this.request(exportAction, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString(),
        redirect: 'follow'
      });

      const html = await response.text();
      const $ = cheerio.load(html);
      // 优先从表单字段获取生成的导出 URL
      const hiddenUrl = $('input[name="url"]').val();
      if (hiddenUrl) {
        return this.normalizeCalendarUrl(hiddenUrl);
      }

      const execMatch = html.match(/https?:\/\/[^<]*export_execute\.php[^<]*/);
      if (execMatch) {
        const rawUrl = execMatch[0].replace(/&amp;/g, '&');
        return this.normalizeCalendarUrl(rawUrl);
      }

      // 兜底：查找导出链接
      const url = $('a[href*="export_execute"], a[href*="export"]').first().attr('href');
      if (url) {
        return this.normalizeCalendarUrl(url);
      }

      throw new Error('未找到日历导出 URL');
    } catch (e) {
      throw new Error(`获取日历 URL 失败: ${e.message}`);
    }
  }

  // 获取并解析日历
  async fetchCalendar(calendarUrl) {
    try {
      const response = await this.request(calendarUrl, { method: 'GET', redirect: 'follow' });
      const icalData = await response.text();
      if (!icalData.includes('BEGIN:VCALENDAR')) {
        const preview = icalData.substring(0, 200).replace(/\s+/g, ' ');
        throw new Error(`返回内容不是 iCal (status=${response.status}) preview=${preview}`);
      }

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

  normalizeCalendarUrl(url) {
    if (!url) return url;
    let normalized = url.trim();
    if (normalized.startsWith('webcal://')) {
      normalized = `https://${normalized.substring('webcal://'.length)}`;
    }
    if (normalized.startsWith('/')) {
      normalized = `${LEXUE_URL}${normalized}`;
    }
    return normalized;
  }

  // 获取日程
  async getSchedule(days = 7) {
    try {
      // 1. 获取 sesskey
      const sesskey = await this.getSesskey();
      console.log('获取到 sesskey');

      // 2. 获取日历导出 URL
      const calendarUrl = await this.getCalendarUrl(sesskey);
      console.log('获取到日历 URL:', calendarUrl);

      // 3. 获取并解析日历
      const events = await this.fetchCalendar(calendarUrl);

      // 4. 过滤近期事件
      const now = new Date();
      const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const filteredEvents = events.filter(event => {
        if (!event.start) return false;
        const eventTime = new Date(event.start);
        return eventTime >= now && eventTime <= future;
      });

      return filteredEvents;
    } catch (e) {
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
          console.error('用法: node lexue-client.js login --username 学号 --password 密码');
          process.exit(1);
        }

        const username = args[usernameIdx + 1];
        const password = args[passwordIdx + 1];
        await client.login(username, password);
        break;
      }

      case 'schedule': {
        const usernameIdx = args.indexOf('--username');
        const passwordIdx = args.indexOf('--password');
        const daysIdx = args.indexOf('--days');
        const days = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1]) : 7;

        if (usernameIdx !== -1 && passwordIdx !== -1 && args[usernameIdx + 1] && args[passwordIdx + 1]) {
          const username = args[usernameIdx + 1];
          const password = args[passwordIdx + 1];
          const ok = await client.login(username, password);
          if (!ok) {
            console.error('登录失败，无法获取日程');
            process.exit(1);
          }
        }

        const events = await client.getSchedule(days);
        console.log(JSON.stringify({
          success: true,
          count: events.length,
          days,
          events
        }, null, 2));
        break;
      }

      case 'status': {
        const status = await client.checkStatus();
        console.log(JSON.stringify(status, null, 2));
        break;
      }

      default:
        console.log('用法:');
        console.log('  node lexue-client.js login --username 学号 --password 密码');
        console.log('  node lexue-client.js schedule --days 7 [--username 学号 --password 密码]');
        console.log('  node lexue-client.js status');
        break;
    }
  } catch (e) {
    console.error('错误:', e.message);
    process.exit(1);
  }
}

main();
