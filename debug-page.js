#!/usr/bin/env node

import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  console.log('Opening login page...');
  await page.goto('https://sso.bit.edu.cn/cas/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for any content
  await page.waitForTimeout(5000);

  // Get all input elements
  const inputs = await page.$$('input');
  console.log('Total input elements:', inputs.length);

  // Get all visible input elements
  for (let i = 0; i < inputs.length; i++) {
    const name = await inputs[i].getAttribute('name');
    const type = await inputs[i].getAttribute('type');
    const id = await inputs[i].getAttribute('id');
    const isVisible = await inputs[i].isVisible();
    const value = await inputs[i].inputValue().catch(() => '');
    console.log(`Input ${i}: name=${name}, type=${type}, id=${id}, visible=${isVisible}, value=${value.substring(0, 20)}`);
  }

  // Take screenshot
  await page.screenshot({ path: 'login-page.png', fullPage: true });
  console.log('Screenshot saved to login-page.png');

  // Get form
  const forms = await page.$$('form');
  console.log('Total forms:', forms.length);

  await browser.close();
}

main().catch(console.error);
