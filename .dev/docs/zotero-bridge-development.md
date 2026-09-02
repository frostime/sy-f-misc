---
title: Zotero Bridge 开发与发布
description: 维护 sy-f-misc Zotero Bridge 源码、XPI、自动更新清单和独立 GitHub Release 的操作约束。
scope:
  - /src/external/zotero-bridge/**
  - /src/func/zotero/**
  - /.github/workflows/release-zotero-bridge.yml
updated: 2026-09-02
---

# Zotero Bridge 开发与发布

修改 Zotero Bridge、调整 Zotero 兼容范围或发布新版 XPI 前阅读本文。Bridge 与 sy-f-misc 主插件使用不同的版本和发布周期；普通 sy-f-misc Release 不应附带未变化的 XPI。

## 文件和发布渠道

| 对象 | 位置 | 职责 |
| --- | --- | --- |
| Bridge 源码和安装清单 | `src/external/zotero-bridge/` | Zotero 内运行的扩展代码 |
| 仓库 XPI | `src/external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi` | 自动更新和插件分发包共用的安装文件 |
| 更新清单 | `src/external/zotero-bridge/updates.json` | 告知已安装 Bridge 最新版本、兼容范围、下载地址和 SHA-256 |
| 运行与发布合同 | `src/func/zotero/SPEC.md` | Bridge API、包内容、兼容性和发布不变量 |
| 独立发布工作流 | `.github/workflows/release-zotero-bridge.yml` | 仅在 Bridge tag 推送时创建 GitHub Release |

发布链分为三个入口：

```text
Zotero 自动更新 ── updates.json ── Raw main XPI

sy-f-misc package.zip ── external/zotero-bridge/*.xpi

zotero-bridge-v* tag ── 独立 GitHub Release ── 同一份 XPI
```

Raw XPI 是自动更新源。独立 GitHub Release 用于版本归档和手动下载，不参与 Zotero 的更新寻址。普通 sy-f-misc Release 只发布主插件产物。

## 发布不变量

一次 Bridge 改动必须同步维护以下值：

```text
manifest.json.version
    == updates.json 中的 version
    == XPI 内 manifest.json.version
    == zotero-bridge-v<version> 的 <version>

updates.json.update_hash
    == SHA-256(仓库 XPI)
    == SHA-256(独立 Release 中的 XPI)
```

还必须满足：

- `manifest.json` 与 `updates.json` 声明相同的 Zotero 兼容范围。
- `updates.json.update_link` 指向仓库 `main` 分支中的 Raw XPI。
- `package.zip` 中的 XPI与仓库 XPI 字节相同。
- CI 直接上传仓库 XPI，不重新打包。
- 只有 Bridge 版本变化时才创建 `zotero-bridge-v*` tag。

## 修改和发布步骤

### 1. 修改源码并确定版本

运行时代码位于 `src/external/zotero-bridge/bootstrap.js` 和 `content/`。任何需要向已安装用户下发新 XPI 的改动，都应提升 `manifest.json.version`。

只调整在线兼容性声明且不需要新安装包时，Zotero 支持仅更新 `updates.json`；不要为此创建内容不同但版本相同的 XPI。

### 2. 重新打包

```bash
rm -f src/external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi
bash src/external/zotero-bridge/pack.sh
```

`pack.sh` 输出新 XPI 的 SHA-256。将该值写入 `updates.json.update_hash`，并同步版本和兼容范围。

### 3. 做仓库级验证

```bash
pnpm build
```

确认：

- XPI 内只有 `manifest.json`、`bootstrap.js` 和 `content/`。
- XPI 内 manifest 与源码 manifest 相同。
- `updates.json.update_hash` 等于仓库 XPI 的 SHA-256。
- `package.zip` 包含 `external/zotero-bridge/f-zotero-ext@frostime.github.io.xpi`，且字节与仓库 XPI 相同。

### 4. 做 Zotero 运行时测试

至少测试当前最低支持版本和最新支持版本。当前测试范围是 Zotero 9 与 Zotero 10。

每个版本检查：

1. 从文件安装 XPI并重启 Zotero。
2. 请求 `/f-zotero-ext/api/v1/status`。
3. 在 Zotero 选中文献后请求 `/f-zotero-ext/api/v1/selected`。
4. 在 SiYuan 中运行“检查连接”。
5. 验证 `/cite` 和 Zotero Note 导入。

访问 `127.0.0.1:23119` 时发送：

```text
Zotero-Allowed-Request: true
```

只完成代码审查或构建检查时，不要声称已经通过 Zotero 运行时测试。

### 5. 合并并验证自动更新

将 manifest、updates、XPI 和相关 SPEC 改动放进同一 changeset，合并到 `main`。合并后检查 Raw XPI 的 SHA-256 是否仍与 `updates.json` 一致。

验证真实自动更新时，在 Zotero 安装上一个 Bridge 版本，然后手动执行 `Check for Updates`。确认升级后的版本和 `/status` 返回值均正确。

### 6. 创建独立 Bridge Release

在通过运行时测试后，对包含最终 XPI 的 `main` commit 创建 tag：

```bash
git tag -a zotero-bridge-v0.1.1 -m "Zotero Bridge v0.1.1"
git push origin zotero-bridge-v0.1.1
```

`.github/workflows/release-zotero-bridge.yml` 会验证 tag、manifest、updates 和 XPI，随后创建不占用仓库 Latest 标记的独立 Release。校验失败时不会发布。

发布后下载 Release asset 并复核 SHA-256。不要手工替换已有版本的 asset；需要改变 XPI 时发布新版本。

## GitHub Release 的边界

同一仓库无法为一组 tag 提供独立的 `releases/latest` 语义。仓库级 Latest 应留给 sy-f-misc 主插件。因此：

- 自动更新使用固定的 Raw main URL。
- Bridge Release 使用版本化 tag，例如 `zotero-bridge-v0.1.1`。
- 不维护可变的 `zotero-bridge-latest` tag，也不反复覆盖同名 asset。

如果 Bridge 将来形成独立项目和发布节奏，再迁移到独立仓库；当前规模不需要承担该维护成本。

## 故障定位

| 现象 | 优先检查 |
| --- | --- |
| Zotero 拒绝安装 | XPI 内 `strict_min_version` / `strict_max_version` |
| Zotero 未发现更新 | `manifest.json.update_url`、`updates.json.version`、Raw URL 可访问性 |
| 更新下载后校验失败 | Raw XPI 与 `updates.json.update_hash` 是否来自同一次打包 |
| Bridge tag workflow 失败 | tag 版本是否等于 manifest 和 updates 版本 |
| Release XPI 与仓库不同 | 工作流是否改为重新打包或上传了其他路径 |
| curl 成功但 SiYuan 失败 | `Origin`、`User-Agent` 和 `Zotero-Allowed-Request` header |
