// Рисует PNG-иконки из icon.svg. Запуск: node make-icons.mjs
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg');
const full = (s, f) => sharp(svg, { density: 384 }).resize(s, s).png().toFile('public/icons/' + f);
await full(192, 'icon-192.png');
await full(512, 'icon-512.png');
await full(180, 'apple-touch-icon.png');
// maskable: фон на весь холст, рисунок в безопасной зоне 80%
const inner = await sharp(svg, { density: 384 }).resize(410, 410).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#0b6e75' } })
  .composite([{ input: inner, gravity: 'center' }]).png().toFile('public/icons/icon-maskable-512.png');
