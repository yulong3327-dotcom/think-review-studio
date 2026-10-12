# Think Studio · JSON 审核工作台

[在线网站](https://yulong3327-dotcom.github.io/think-review-studio/) · [GitHub 仓库](https://github.com/yulong3327-dotcom/think-review-studio)

Think JSON 批量审核网站。JSON 与完整可视化直接对应，支持在讲解页面修改文字、公式、旁白与绘图。首次打开提供 26 条参考讲解，首次导入替换参考数据，之后追加。

## 在线与本地

在线版可批量导入、编辑、审核、导出；数据保存在当前浏览器的 IndexedDB。

线上版已接入 AI 直连 `https://ccproxy.yukework.com/v1/chat/completions`，可配置密钥与模型。接口必须允许来自 `https://yulong3327-dotcom.github.io` 的 CORS 请求，并对 OPTIONS 预检返回允许 POST、Authorization、Content-Type 的响应。截至实测，当前接口 OPTIONS 返回 404，POST 未包含 Access-Control-Allow-Origin，浏览器会拦截直连。服务方开放 CORS 后无需改网站即可使用。本地版仍通过同源代理正常调用。

Windows 安装 Node.js 24 或更新版本后，下载仓库 ZIP、解压，双击 **启动审核网站.cmd**。保持命令窗口打开，访问 http://127.0.0.1:5173 。也可执行：

```powershell
npm install
npm run dev
```

## AI 圈选修改

1. 点击审核栏「AI 圈选」，第一次在 AI 设置中填写 API 密钥并保存。默认服务 `https://ccproxy.yukework.com`，默认模型 `gpt-6-sol`，模型可修改。
2. 直接拖选讲解文字、旁白，或在图中拖动框选错误部分；也可点击区块「AI 修改此区块」。框选 Canvas / SVG 会附带该区域截图，普通 DOM 图附带区域坐标和对应代码。
3. 在「告诉 AI 问题」中描述要求，点击「生成修改建议」。可取消请求。
4. 检查字段修改前后对比，点击「应用到 JSON」。同步更新预览，支持撤销。生成期间若 JSON 已改变，需要重新生成，避免覆盖后续编辑。

密钥仅保存在当前浏览器的本地设置中，可清除；不内置在源码、构建文件或 GitHub 仓库。调用 AI 会发送当前完整 JSON、问题描述及选中区域至配置的服务，数据无需先上传至本网站。代理只允许本机同源访问，目标服务固定，不支持转发任意网址。AI 仅可修改既有讲解字段与绘图代码，通过 JSON 结构、函数引用及 JavaScript 语法校验后才能应用，扩展字段原样保留。

## 审核与导出

1. 点击「粘贴导入」，默认进入复制粘贴模式。一次粘贴多段 JSON，自动预览题目数量、每题讲解区块和解析错误。支持连续 JSON、数组、JSONL、Markdown 和 Excel 转义文本；同一 JSON 内多个 question-index 自动拆为独立题目，并保留对应与共享绘图函数及扩展字段。点击「导入 N 道题」完成。也可切换文件导入。
2. 列表选中讲解，整份内容一次展开。「显示旁白」查看旁白；「隐藏 JSON」和「专注审核」扩大审核区。
3. 普通编辑模式点击文字直接修改，实时写回 JSON。点击图中文字可修改对应字符串；变量生成的文字可展开「修改绘图」编辑函数与参数。源码改动点击「应用」生效。
4. 记录意见、标记待审核 / 需修改 / 已通过，用「修改对比」检查原始数据与当前版本。撤销历史保留在当前会话。
5. 导出当前或批量勾选。ZIP 每条一个 JSON，可附带独立审核意见报告；也支持 JSON 数组和 JSONL。

## 导入格式

- JSON：对象、数组，兼容 `documents / records / data / results` 等包裹结构。
- JSONL：每行一个对象。
- TXT：连续 JSON、Markdown 代码块、表格复制的双引号。
- CSV / XLSX：每条完整 JSON 占一个单元格。
- ZIP：包内 JSON、JSONL、TXT 与 CSV。

`examples/` 提供单条与批量示例。更换浏览器、清除浏览器数据前请先导出备份。在线版与本地版的工作空间分别保存，可通过导入导出迁移。

## 绘图与部署

支持 `steps` 和 `func_list`。绘图函数为 `function name(container, cb, ...params)`，以对应 `func_params` 在沙箱 iframe 中执行，支持自包含 DOM、Canvas、SVG，禁止联网及访问主页面。

```powershell
npm run test
npm run build
```

推送 `main` 后，GitHub Actions 自动测试、构建并发布 GitHub Pages。仓库 Settings → Pages 的 Source 设为 GitHub Actions。生产构建不包含本地代理或密钥。
