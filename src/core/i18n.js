// 语言偏好（LLM 输出语言控制）。
// 作用域：控制 LLM 各通道（精灵生成/灵魂聊天/战斗台词/记忆压缩/分享文案）的输出语言。
// 不做 UI 全量翻译——本地数据表/模板文案仍是中文（非 LLM 内容），保持轻量。
//
// 存储：localStorage funny-pets-lang-v1，值为 BCP-47 主标签（en/ja/zh…）。
// 默认：跟随浏览器（navigator.languages[0]），无法识别时回落 zh（游戏主体语言）。

const LANG_KEY = 'funny-pets-lang-v1';

// 支持的语言清单（主标签 → 展示名）。覆盖主流语种 + 游戏原生中文。
// label 用各自语言的自称（国际化惯例：语言名用它自己写）。
export const LANGUAGES = [
  { code: 'zh', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁體）' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'it', label: 'Italiano' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'th', label: 'ไทย' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'tr', label: 'Türkçe' },
];

// prompt 里的语言描述（给 LLM 的指令用语言自称，识别最稳）
const LANG_DIRECTIVE = {
  zh: '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어（韩语）',
  es: 'Español（西班牙语）',
  fr: 'Français（法语）',
  de: 'Deutsch（德语）',
  pt: 'Português（葡萄牙语）',
  it: 'Italiano（意大利语）',
  ru: 'Русский（俄语）',
  ar: 'العربية（阿拉伯语）',
  hi: 'हिन्दी（印地语）',
  th: 'ไทย（泰语）',
  vi: 'Tiếng Việt（越南语）',
  id: 'Bahasa Indonesia（印尼语）',
  tr: 'Türkçe（土耳其语）',
};

const VALID = LANGUAGES.map(l => l.code);

// 浏览器语言 → 支持清单映射（en-US→en, zh-Hans-CN→zh, zh-TW→zh-TW…）
function fromBrowser() {
  const cands = (typeof navigator !== 'undefined' && navigator.languages?.length)
    ? navigator.languages : (typeof navigator !== 'undefined' && navigator.language ? [navigator.language] : []);
  for (const raw of cands) {
    if (!raw) continue;
    const tag = String(raw);
    // 完整匹配（zh-TW 精确命中）
    if (VALID.includes(tag)) return tag;
    // 主标签匹配（en-US → en）
    const primary = tag.split('-')[0];
    if (primary === 'zh') {
      // 中文特殊：TW/HK 用繁体，其余简体
      return /tw|hant/i.test(tag) ? 'zh-TW' : 'zh';
    }
    if (VALID.includes(primary)) return primary;
  }
  return 'zh';
}

export function readLangPref() {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (raw && VALID.includes(raw)) return raw;
  } catch { /* 隐私模式等 storage 异常：回落浏览器检测 */ }
  return fromBrowser();
}

export function writeLangPref(code) {
  if (!VALID.includes(code)) return false;
  try { localStorage.setItem(LANG_KEY, code); } catch { /* 写失败静默 */ }
  return true;
}

/** prompt 注入用：当前语言的指令描述（如「日本語」/「English」） */
export function langDirective() {
  return LANG_DIRECTIVE[readLangPref()] ?? LANG_DIRECTIVE.zh;
}
