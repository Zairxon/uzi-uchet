# Учёт УЗИ-центра

Самостоятельное приложение (PWA) на Vite и чистом JavaScript. Данные хранятся на устройстве в IndexedDB, бэкенда нет.

```
npm install
npm run dev       # разработка
npm test          # тесты расчётов и хранилища
npm run build     # сборка в dist/ (с manifest и service worker)
npm run preview   # посмотреть сборку на http://localhost:4173
node make-icons.mjs   # перерисовать PNG-иконки из public/icons/icon.svg
```

- `src/calc.js` — sched, payCalc, compute, ytd (формулы из прототипа) и balance.
- `src/storage.js` — IndexedDB: `config/main` и `months/ГГГГ-ММ`, резервная копия одним JSON.
- Установка на телефон: открыть сайт в Chrome → «Установить приложение». Для установки нужен HTTPS (или localhost).
- Данные не покидают устройство, поэтому делайте копию на вкладке «Настройки».
