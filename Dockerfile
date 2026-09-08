# ---- 构建阶段：Vite 打包 ----
FROM node:22-bookworm-slim AS build
# 注意：工作目录不可叫 /app —— 项目内有 app/ 目录，Vite 会把绝对路径入口
# /app/index.html 误当作 URL 解析成 <root>/app/index.html，导致宣传页入口丢失
WORKDIR /site
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- 运行阶段：nginx 托管静态文件 ----
FROM nginx:latest
# Vite base 为 /funny-pets/，构建产物挂到同名子路径下
COPY --from=build /site/dist /usr/share/nginx/html/funny-pets
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    # 302/301 的 Location 用相对路径，避免默认绝对重定向丢端口（http://localhost/...）
    absolute_redirect off;
    root /usr/share/nginx/html;

    # 站点结构：/ = 宣传页，/app/ = 游戏本体（与 GitHub Pages 部署一致）
    location = /     { return 302 /funny-pets/; }
    location = /app  { return 302 /funny-pets/app/; }
    location = /app/ { return 302 /funny-pets/app/; }

    location /funny-pets/ {
        try_files $uri $uri/ =404;
    }
}
EOF
EXPOSE 80
