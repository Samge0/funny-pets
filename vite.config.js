import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// GitHub Pages 项目页部署在 https://<user>.github.io/<repo>/ 子路径下，
// base 必须与仓库名一致，否则资源 404。
export default defineConfig({
  base: '/funny-pets/',
  plugins: [vue()],
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
