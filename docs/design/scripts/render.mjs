import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const only = process.argv[2];
for (const f of fs.readdirSync('../mocks').filter(x=>x.endsWith('.html') && (!only || x.includes(only)))) {
  const n=f.replace('.html','');
  const sizes = n.includes('hero') ? [[1600,900,'']] : [[1440,900,'-desktop'],[390,844,'-mobile']];
  for (const [w,h,s] of sizes) {
    const p = await b.newPage({ viewport:{width:w,height:h} });
    await p.goto('file://'+process.cwd()+'/../mocks/'+f, {waitUntil:'networkidle'});
    await p.waitForTimeout(400);
    await p.screenshot({ path:`../png/${n}${s}.png`, fullPage: !n.includes('hero') });
    await p.close();
  }
}
await b.close();
