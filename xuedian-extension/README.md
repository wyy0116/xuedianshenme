# 学点什么 · Chrome 扩展

进入知乎问题页后，左侧浮出「学点什么」：自动生成学习路径与可翻开闪卡。无需知乎登录。

**默认后端（公网）：** `http://47.99.56.179`  
（也可在扩展选项里改成 `http://47.99.56.179:8787` 或本机 `http://127.0.0.1:8787`）

## 安装

1. 下载本仓库，或下载 [Releases](../../releases) 里的 `xuedian-extension.zip` 并解压
2. Chrome 打开 `chrome://extensions`
3. 打开「开发者模式」
4. 「加载已解压的扩展程序」→ 选择本目录（含 `manifest.json` 的那一层）
5. 打开任意 `https://www.zhihu.com/question/...`，整页刷新一次

## 配置

扩展选项页可切换 API 根地址：

| 预设 | 地址 |
|------|------|
| 云服务器（默认） | `http://47.99.56.179` |
| 云直连端口 | `http://47.99.56.179:8787` |
| 本机开发 | `http://127.0.0.1:8787` |

保存后若仍走旧地址：在 `chrome://extensions` 点扩展的「重新加载」，或清掉站点缓存后再开问题页。

## 目录结构

```
extension/
  manifest.json
  background/service-worker.js
  content/content.js
  content/sidebar.css
  options/
  popup/
  assets/
```

## 版本

当前 `0.4.0`：默认对接公网 IP，闪卡与网页学习路径共用后端 `/api/path` 返回的 `cards`。
