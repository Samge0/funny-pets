import { readFileSync } from 'node:fs';
const s = readFileSync('dist/assets/snapshot-CbmqHykE.js', 'utf8');
console.log('文件大小:', s.length);
console.log('--- x( 调用处上下文 ---');
const i = s.indexOf('x(');
console.log(s.slice(Math.max(0, i - 120), i + 80));
console.log('--- 检查 snapshot chunk 是否含旧 sprite3d 内联代码（看 L 特征 bodyW） ---');
console.log('bodyW:', s.indexOf('bodyW') >= 0, '  mouthType:', s.indexOf('mouthType') >= 0);
