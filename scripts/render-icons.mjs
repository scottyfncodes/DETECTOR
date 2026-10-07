// Renders public/icons/icon.svg to the PNG icon set: node scripts/render-icons.mjs
// (uses Chromium at CHROMIUM_PATH or /opt/pw-browsers/chromium).
import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = new URL('../public/icons', import.meta.url).pathname;
const svg = fs.readFileSync(`${dir}/icon.svg`, 'utf8');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
for (const [name, size, pad] of [['apple-touch-icon.png',180,0],['icon-192.png',192,0],['icon-512.png',512,0],['icon-maskable-512.png',512,0]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  const inner = Math.round(size*(1-pad*2));
  await p.setContent(`<html><body style="margin:0;background:#0c100e;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body></html>`);
  await p.screenshot({ path: `${dir}/${name}` });
  await p.close();
}
await b.close();
