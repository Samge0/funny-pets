// 给全部测试钉 zh-CN locale（既有断言都是中文；UI 现在跟随浏览器语言）
// 两种形态：browser.newPage({...}) / browser.newPage() / newContext().newPage()
const fs = require('fs');
const dir = 'F:/Space/PRO/test/funny-pets/tests/';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
  let s = fs.readFileSync(dir + f, 'utf8');
  if (s.includes("locale: 'zh-CN'")) { console.log(f, 'already'); continue; }
  const before = s;
  // A: newPage({ viewport: ... }) → 加 locale
  s = s.replace(/browser\.newPage\(\{ viewport:/g, "browser.newPage({ locale: 'zh-CN', viewport:");
  // B: newPage() → newPage({locale})
  s = s.replace(/browser\.newPage\(\)/g, "browser.newPage({ locale: 'zh-CN' })");
  // C: newContext({...}) 里加 locale（d35/36/37 形态）
  s = s.replace(/browser\.newContext\(\{ viewport:/g, "browser.newContext({ locale: 'zh-CN', viewport:");
  s = s.replace(/browser\.newContext\(\{ locale: 'en-US', viewport:/g, "browser.newContext({ locale: 'zh-CN', viewport:"); // d37 原本 en-US 断言默认语言——改为 d38 专测
  if (s !== before) { fs.writeFileSync(dir + f, s); console.log(f, 'patched'); }
  else console.log(f, 'NO MATCH (check manually)');
}
