# 奇幻萌宠 FunPets 🐾

> 🌐 **在线游玩**：<https://samge0.github.io/funny-pets/>（宣传页）· [直接进入游戏](https://samge0.github.io/funny-pets/app/)

纯前端的原创精灵捕捉休闲游戏，参考 [Licoy/tihuqiche](https://github.com/Licoy/tihuqiche) 的工程模式（Vue 3 + Vite + Three.js + GitHub Pages 官方 Actions 部署）。所有精灵均为随机生成的**原创** 3D 形象与名字，不包含任何现有动漫/游戏作品的受版权保护内容。

![宣传页](test-results/promo-desktop.png)

## 玩法

- **3D 原创精灵**：Three.js 程序化建模（球体/胶囊/圆锥图元组合），身体×头身比×耳朵×尾巴×花纹×四肢×背刺×头角×翅膀×眼睛×嘴型×配色十余个差异维度，组合空间上千万；内置呼吸/摇摆/扇翅待机动画。
- **探索 6 张地图**：微风草原 → 月光浅滩 → 回声洞窟 → 烬尾火山 → 雾语秘林 → 天穹之巅（按捕捉数逐步解锁），每张有属性出没偏好、稀有度权重与**野生等级带**，越往后越强。
- **捕捉不限量**：普通精灵球无限供应，可直接丢球或开战打残再捕（血量越低越容易，战斗内实时显示捕获率）。
- **回合制对战**：宝可梦式伤害公式、HP 池加大（同级平均 10+ 回合）、18 属性克制、本系加成、会心一击、命中率、变化类 buff 技能；冲撞/闪红/飘字/震屏动画；我方倒下可换宠续战。
- **升级与进化**：战斗胜利获得经验（全队 40% 经验分享），18 级/36 级两段进化——种族值成长、技能威力升级或新增技能、体型放大、追加背刺与属性光环。
- **庆祝反馈**：捕捉成功 / 升级 / 进化触发全屏庆祝弹窗——星爆粒子、缩放弹入、3D 精灵展示、图鉴描述。
- **图鉴与收集**：遇见记录 + 捕捉目标（30 只），图鉴小图为 3D 离屏渲染快照。
- **存档**：localStorage 本地保存 + 一键导出/导入 JSON 存档文件（带校验，防脏数据）。
- **AI 生成（可选）**：设置页配置任意 OpenAI 兼容接口（Base URL / Model / API Key）后，每次刷新精灵由大模型生成名字、属性组合与图鉴描述；关闭或请求失败时自动降级本地随机。API Key 只存在你自己的浏览器里。

## 本地开发

需要 Node.js 18+。

```bash
npm install
npm run dev        # 开发热更新（游戏在 /app/ 路径）
npm run build      # 产物输出 dist/（/ = 宣传页，/app/ = 游戏）
npm run preview    # 本地预览构建产物
node tests/smoke.mjs   # Playwright 冒烟测试（需先 build；可用 PLAYWRIGHT_CHANNEL=chrome 复用本机 Chrome）
node scripts/render-promo-pets.mjs  # 重新生成宣传页 3D 精灵快照（改动造型维度后运行）
```

## 站点结构

部署后 `/` 为宣传页（含随机精灵展示、玩法说明、AI 生成介绍），`/app/` 为游戏本体。宣传页的精灵展示与属性云由构建时脚本（`promo/main.js`）注入真实游戏数据，固定种子采样保证每次构建产物稳定。

## 部署到 GitHub Pages

1. 新建仓库 `funny-pets`（与 `vite.config.js` 里的 `base: '/funny-pets/'` 一致；改名需同步修改）。
2. 推送代码到 `main` 分支。
3. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 之后每次推送自动构建部署；`.github/workflows/deploy.yml` 已就绪，无需 gh-pages 分支和个人令牌。

本地访问 `http://127.0.0.1:4173/funny-pets/`（宣传页）、`http://127.0.0.1:4173/funny-pets/app/`（游戏）。

## Docker 部署

仓库自带 [Dockerfile](Dockerfile)、[.dockerignore](.dockerignore) 与 [docker-compose.yaml](docker-compose.yaml)：多阶段构建（Node 执行 `vite build` → nginx 托管 `dist/` 静态产物），nginx 已按 `base: '/funny-pets/'` 配好路径映射，`/` 与 `/app/` 会 302 到对应子路径，与 GitHub Pages 部署的站点结构一致。

```bash
docker compose up -d --build    # 构建并启动（宿主机端口 4173 → 容器 80）
```

启动后访问 <http://localhost:4173/>（宣传页，自动跳转 `/funny-pets/`）、<http://localhost:4173/app/>（游戏）。改端口只需编辑 `docker-compose.yaml` 里的 `ports` 映射。

> 构建阶段的工作目录为 `/site` 而非惯用的 `/app`：项目内有 `app/` 目录，Vite 会把绝对路径入口 `/app/index.html` 误解析为 URL 命中 `<root>/app/index.html`（游戏页），导致宣传页入口在构建产物中丢失。详见 Dockerfile 内注释。

## 项目结构

```text
├── index.html              # 宣传页（站点根路径 /）
├── promo/
│   ├── main.js             # 宣传页属性云注入（对比度自适应）
│   └── pets/*.png          # 3D 精灵快照（渲染脚本产物）
├── app/index.html          # 游戏入口（/app/ 路径）
├── scripts/
│   └── render-promo-pets.mjs  # 宣传页 3D 快照渲染（Playwright + WebGL）
├── src/
│   ├── App.vue / main.js    # 应用与入口
│   ├── components/
│   │   ├── Pet3D.vue        # 3D 精灵挂载组件（共享场景管理）
│   │   └── Celebration.vue  # 捕捉/升级/进化全屏庆祝弹窗
│   ├── data/
│   │   ├── types.js         # 18 属性 + 完整克制表
│   │   ├── maps.js          # 6 张地图（属性偏好/稀有度权重/等级带/主题）
│   │   ├── moves.js         # 按属性划分的技能池（全原创命名）
│   │   ├── names.js         # 名字库/图鉴模板/性格/稀有度
│   │   └── traits.js        # 造型特征库
│   ├── core/
│   │   ├── rng.js           # mulberry32 确定性随机（同 seed 同精灵）
│   │   ├── generator.js     # 本地精灵生成器
│   │   ├── evolve.js        # 数值成长/经验曲线/两段进化/技能升级
│   │   ├── battle.js        # 回合制战斗引擎（宝可梦式公式/buff/命中率）
│   │   ├── sprite3d.js      # Three.js 程序化 3D 精灵构建器 + 离屏快照
│   │   ├── sprites.js       # SVG 渲染（兜底/宣传页备用）
│   │   ├── llm.js           # OpenAI 兼容客户端 + 输出校验 + 降级
│   │   └── rng.js
│   ├── store.js             # 全局响应式状态
│   └── storage.js           # 存档（版本化 + schema 校验 + 导入导出）
├── tests/smoke.mjs          # Playwright 冒烟测试（12+ 断言）
├── .github/workflows/deploy.yml  # Pages 自动部署
└── vite.config.js
```

## License

MIT
