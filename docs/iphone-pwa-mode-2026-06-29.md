# iPhone PWA 模式

目标：先不生成 IPA，把主网页做成 iPhone 可安装的桌面应用入口。

## 使用方式

1. 用 iPhone Safari 打开 `https://pix.lovenom.eu.org/`。
2. 点 Safari 底部分享按钮。
3. 选择“添加到主屏幕”。
4. 从桌面图标打开 Hermes Pixel Office。

## 当前策略

- PWA 入口是主办公室页面 `/?pwa=1`，不是简化版 `iphone.html`。
- API 与聊天接口实时走网络，不走离线缓存。
- 页面壳、图标、manifest 只做离线兜底。
- 登录仍然由 Hermes 后台处理，浏览器会保存登录 Cookie。

## 如果手机仍显示旧版

先强制刷新 `https://pix.lovenom.eu.org/?v=20260629-pwa`。

如果桌面图标仍旧，删除旧桌面图标后重新添加一次。
