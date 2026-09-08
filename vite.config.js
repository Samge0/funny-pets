import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

// GitHub Pages 项目页部署在 https://<user>.github.io/<repo>/ 子路径下。
// 站点结构：/ = 宣传页（根），/app/ = 游戏本体。
// 注意：游戏内部资产引用基于 base '/funny-pets/'，所以 app 入口的 html 放在
// app/index.html 且使用相对资源路径由 Vite 重写；base 保持仓库名。
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
