# Think Studio 的 AI 接口跨域配置

网站已经直接调用 `https://ccproxy.yukework.com/v1/chat/completions`。本地版使用同源代理，不受浏览器跨域限制。

2026-10-12 验证：带密钥的 POST 可以返回 200；从 GitHub Pages 发起的 OPTIONS 预检返回 404，POST 响应没有 `Access-Control-Allow-Origin`。普通浏览器因此无法读取接口结果。网页代码无法替接口添加这些响应头。

需要在 **AI 服务的网关或服务端** 配置以下内容，不能加在 GitHub Pages 前端：

```http
Access-Control-Allow-Origin: https://yulong3327-dotcom.github.io
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Vary: Origin
```

OPTIONS 请求应直接返回 204 或 200，无需鉴权，不转发到模型。正常 POST、401、429 等错误响应均需包含允许本站 Origin 的响应头。POST 继续使用原有 Bearer 密钥鉴权。

无密钥即可检查预检配置：

```powershell
curl.exe -i -X OPTIONS `
  -H "Origin: https://yulong3327-dotcom.github.io" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: authorization,content-type" `
  https://ccproxy.yukework.com/v1/chat/completions
```

配置完成后，打开在线网站，在 AI 设置中填入密钥，选中讲解、描述问题并生成修改建议即可。网站无需再次改代码或发布。密钥只保存在当前浏览器，不需要写进 GitHub 仓库。
