const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  await page.goto('http://localhost:3000');
  await page.waitForSelector('.forge-app');
  
  // click the first call button
  const callBtn = await page.$('.detail-action-call');
  if (callBtn) {
    await callBtn.click();
  }
  
  // wait for dock
  await page.waitForSelector('.call-dock-container', { timeout: 5000 }).catch(() => {});
  
  // take screenshots of all 3 modes
  // default is topbar
  await page.evaluate(() => {
    const app = document.querySelector('.forge-app');
    if (!app.classList.contains('topbar-mode')) {
      document.querySelector('.forge-traffic').click();
    }
  });
  await page.waitForSelector('.forge-app.topbar-mode');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/opt/cursor/artifacts/nav_mode_topbar.png' });
  
  // Cycle to Slim rail
  await page.click('.forge-traffic');
  await page.waitForSelector('.forge-sidebar.slim');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/opt/cursor/artifacts/nav_mode_slim.png' });
  
  // Cycle to Wide rail
  await page.click('.forge-traffic');
  await page.waitForSelector('.forge-sidebar.wide');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/opt/cursor/artifacts/nav_mode_wide.png' });
  
  await browser.close();
})();
