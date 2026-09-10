import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

// 站点结构：/ = 宣传页（根），/app/ = 游戏本体。
// base 用相对路径 './'：samge0.github.io/<repo>/ 子路径与自定义域名根路径两种形态都正确
// （绝对 '/<repo>/' 会在自定义域名下白屏）。app 入口的 html 放在 app/index.html，
// 相对资源引用由 Vite 按各自入口重写。
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
