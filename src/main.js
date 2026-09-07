import { createApp } from 'vue';
import App from './App.vue';
import './styles/base.css';

const app = createApp(App);
app.config.errorHandler = (error) => {
  console.error('Application error', error);
  const loading = document.getElementById('app');
  if (loading) loading.textContent = `出错了：${error.message}，请刷新页面重试`;
};
app.mount('#app');
