// Сборка и публикация на GitHub Pages (ветка gh-pages). Запуск: npm run deploy
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
const run = (c, o = {}) => execSync(c, { stdio: 'inherit', ...o });
run('npm run build');
const url = execSync('git remote get-url origin').toString().trim();
rmSync('dist/.git', { recursive: true, force: true });
run('git init -q -b gh-pages', { cwd: 'dist' });
run('git add -A', { cwd: 'dist' });
run('git -c user.name=deploy -c user.email=deploy@local commit -q -m "deploy"', { cwd: 'dist' });
run(`git push -f ${url} gh-pages`, { cwd: 'dist' });
