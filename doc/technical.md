# Water Veil 技术文档

## 1. 技术栈

- Vite 6 + 原生 ES Modules
- WebGL 1 全屏 fragment shader
- 平台 `guest-shell.js` 与 `src/shared/runtime/bridge.ts`
- 无运行时 npm 依赖，所有资源随包发布

## 2. 目录结构

- `index.html`：语义结构、标题、身份署名、引导、结算与错误状态。
- `src/main.js`：平台身份解析、WebGL 初始化、触控状态和渲染循环。
- `src/shaders.js`：原作顶点/片元 shader 与产品触点波纹扩展。
- `public/upstream-original.jpg`：`?baseline=1` 的原作内容图。
- `public/publisher-avatar.png`：玩家头像缺失或加载失败时的发布者回退。
- `upstream/`：固定 CodePen 快照与原作者署名证据。
- `_qa/ui/`：390×844、320×568 与原作基线截图。

## 3. 核心模块

身份解析顺序为 URL 调试参数、Aigram `AW.PROFILE.GET`、发布者回退；头像网络加载
失败也会二次降级。渲染器使用一个全屏 `TRIANGLE_STRIP`，每帧只更新时间、触点
位置和触点强度。Pointer Events 维护按下、拖动、松手，松手后的强度插值同时驱动
水面回落和结算条件。页面隐藏时停止 RAF，恢复可见时重启。界面文字根据
`game_locale` 或浏览器语言切换中英文。

## 4. 扩展点

- 改水体参数与触点手感：`src/main.js` 的 `params` 与 `render()`。
- 改原作水面或触点波纹：`src/shaders.js`。
- 改身份来源：`resolveIdentity()`。
- 换发布者回退头像：覆盖 `public/publisher-avatar.png`。
- 改标题、排版或结算动效：`index.html` 与 `src/style.css`。
- 加存档/排行榜：在结算条件触发处接入 `useGameSave` 或排行榜 API；当前玩法不计分。
