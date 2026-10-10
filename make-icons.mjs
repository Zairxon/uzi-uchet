// Готовит логотип и иконки из brand/logo-source.jpg. Запуск: node make-icons.mjs
import sharp from 'sharp';
const SRC = 'brand/logo-source.jpg';
const crop = (left, top, size) => sharp(SRC).extract({ left, top, width: size, height: size });
// квадрат вокруг головы и плеч малыша
const sq = () => crop(260, 90, 1240);
await sq().resize(192).png().toFile('public/icons/icon-192.png');
await sq().resize(512).png({ palette: true, quality: 80, effort: 10 }).toFile('public/icons/icon-512.png');
await sq().resize(180).png().toFile('public/icons/apple-touch-icon.png');
await sq().resize(64).png().toFile('public/icons/favicon.png');
// maskable: рисунок в безопасной зоне (центральные 80%), поэтому берём квадрат шире
await crop(0, 120, 1676).resize(512).png({ palette: true, quality: 80, effort: 10 }).toFile('public/icons/icon-maskable-512.png');
// шапка и баннер главной
await sq().resize(176).jpeg({ quality: 85 }).toFile('src/assets/logo.jpg');
await sharp(SRC).extract({ left: 0, top: 330, width: 1676, height: 760 }).resize(1000).jpeg({ quality: 78 }).toFile('src/assets/hero.jpg');
