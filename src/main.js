import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';
import { applyDevour, evolvePet } from './core/evolve.js';

const app = createApp(App);
app.config.errorHandler = (error) => {
  console.error('Application error', error);
  const loading = document.getElementById('app');
  // 不把 error.message 原样上屏：LLM/网络异常文本可能携带 baseUrl 等敏感配置细节
  if (loading) loading.textContent = '出错了，请刷新页面重试（本地存档不受影响）';
};
app.mount('#app');

// E2E 测试钩子：暴露纯引擎函数（无状态、生产无副作用；deep-test 系列调用）
if (typeof window !== 'undefined') {
  window.__engines = { applyDevour, evolvePet };
}

