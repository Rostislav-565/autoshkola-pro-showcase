import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';

const roots = [join(process.cwd(), 'node_modules'), ...(process.env.NODE_PATH || '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean)];
let globalRoot;
try {
  globalRoot = process.platform === 'win32'
    ? execFileSync('cmd.exe', ['/d', '/c', 'npm root -g'], { encoding: 'utf8' }).trim()
    : execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
} catch {
  globalRoot = undefined;
}
if (globalRoot) roots.push(globalRoot, join(globalRoot, '@nestjs', 'cli', 'node_modules'));
const compiler = roots.map(root => join(root, 'typescript', 'bin', 'tsc')).find(existsSync);
const typeRoots = roots.map(root => join(root, '@types')).filter(root => existsSync(join(root, 'node', 'package.json')));
if (!compiler || !typeRoots.length) {
  console.error('Для сборки требуются установленный TypeScript 5.8+ и типы Node.js. Доступные каталоги можно задать через NODE_PATH.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [compiler, '--project', 'tsconfig.json', '--typeRoots', typeRoots.join(',')], { stdio: 'inherit' });
process.exit(result.status ?? 1);
