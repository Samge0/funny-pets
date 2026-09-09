import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';
import { applyDevour, evolvePet } from './core/evolve.js';

const app = createApp(App);
app.config.errorHandler = (error) => {
  console.error('Application error', error);
  const loading = document.getElementById('app');
  if (loading) loading.textContent = `出错了：${error.message}，请刷新页面重试`;
};
app.mount('#app');

// E2E 测试钩子：暴露纯引擎函数（无状态、生产无副作用；deep-test 系列调用）
if (typeof window !== 'undefined') {
  window.__engines = { applyDevour, evolvePet };
}

