# dsh-zh-layer

<p align="center">
  <a href="https://github.com/Lin-AxiomSight/dsh-zh-layer/actions/workflows/ci.yml"><img src="https://github.com/Lin-AxiomSight/dsh-zh-layer/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/Lin-AxiomSight/dsh-zh-layer/releases"><img src="https://img.shields.io/github/v/release/Lin-AxiomSight/dsh-zh-layer" alt="Release"></a>
</p>

> “装了一堆插件，分不清都是干嘛用的；敲 `/` 弹出一堆命令，想不起用哪个。”
> 看得懂英文，但“看英文 → 脑内翻译 → 理解”的链路，是实打实的注意力损耗。

**这是一层可开关的 DeepSeek Harness 双语覆盖层。**

它不改 DSH 一行源码，通过运行时包装元数据和前端排版，把命令、技能和插件列表渲染成「中文名称 + 英文原名 + 中文功能描述」的形态。

核心不是做“翻译工具”，而是**降低语言切换带来的认知负担**，让你把注意力留在写代码上，而不是认菜单上。

## ✨ 它做了什么？
- **双语排版**：命令、技能和插件列表均支持「中文主显 + 英文原文保留」，不丢原名索引。
- **三种场景模式，一键切换**：
  - **只显示中文（`zh`）**：界面仅保留中文，彻底省去语言切换成本。
  - **中英都显示（`both`）**：中文辅助理解 + 英文原名作为分辨索引（推荐）。
  - **不翻译（`off`）**：录屏、演示时一键关闭，刷新页面立即恢复原版。
- **AI 翻译纯手动触发，绝不偷偷扣费**：由你决定何时点击翻译。仅提交未翻译条目，不点按钮零 Token 消耗。
- **纯净零依赖**：基于原生 Node.js 与浏览器 API 实现，不引入任何第三方 npm 依赖。安装极速，不污染依赖树，和你现有插件生态完美共存。
- **非侵入式包装**：不硬编码、不改 DSH 源码，DSH 升级不影响功能，随时可开关，卸载即恢复。

## 📸 效果预览

| 开启翻译（both） | 关闭翻译（off） |
| :---: | :---: |
| ![命令菜单开启](images/command-both.png) | ![命令菜单关闭](images/command-off.png) |
| ![插件列表开启](images/plugin-both.png) | ![插件列表关闭](images/plugin-off.png) |



## 🔒 隐私说明
AI翻译依赖 DeepSeek 官方 `deepseek-flash` 模型：

- ✅ 触发条件：**必须由你手动点击翻译按钮才会发起请求**，不会后台静默上传内容；
- ✅ 上传内容：仅包含待翻译的插件名称、插件描述、命令和技能名称；
- ❌ 不会上传你的聊天记录、本地文件、配置密钥以及其他任何多余信息。

## 💰 关于成本

- **不点按钮 = 零消耗**：仅在点击「一键全量 AI 翻译」时发起模型调用，闲置零消耗。
- **智能增量翻译**：会先对照已有的翻译缓存，仅提交还没有译文的内容，反复点击也不会重复扣费。
- **成本参考**：实测约 50 项插件 / 命令 / 技能 全量翻译，花费仅 2-3 分钱；实际开销随条目总数、文本长度以及 DeepSeek 实时定价浮动

## 🚀 快速开始
### 安装
##### 方式一：命令行

桌面端：

```bash
dsh plugin --profile desktop add dsh-zh-layer
```

web端：

```bash
dsh plugin --profile web add dsh-zh-layer
```

##### 方式二：客户端图形界面

1. 打开 DSH 客户端，**插件** 页面，点击 **添加插件** 。
2. 直接输入包名 `dsh-zh-layer` 或指定版本的 `dsh-zh-layer@0.6.0`点击安装。

##### 方式三：插件市场

在 DSH 的「发现」或「插件市场」中搜索 `dsh-zh-layer`，点击安装。

### 使用

1. 安装插件并重启 DSH。
2. 进入 **设置 → 翻译设置**，选择你偏好的显示模式。
3. 页面会自动统计未翻译条目，点击一键翻译补全内容。
4. 聊天框输入 `/` 呼出菜单，或打开插件列表，即可看到翻译效果。

### 💡 进阶

- 可在设置页修改 AI 翻译提示词（默认即可直接使用）。
- 需要微调翻译内容，在设置页点击打开配置文件夹即可手动编辑词典。
- 配置与词典文件保存在 `~/.dsh/zh-layer-config/`，全局共用。
- **AI 翻译的输入内容**：对于插件，AI会读取“插件元数据中的名称与描述”来理解其功能；对于命令和技能，则直接读取你呼出菜单时抓取到的命令名。

### 卸载

##### 方式一：命令行

桌面端：

```bash
dsh plugin --profile desktop remove dsh-zh-layer
```

web端：

```bash
dsh plugin --profile web remove dsh-zh-layer
```

##### 方式二：**客户端界面卸载**

「设置 → 插件」，找到 `dsh-zh-layer` 并点击 卸载，确认后重启 DSH。

> 已生成的翻译文本（位于 `~/.dsh/zh-layer-config/`）。如需彻底移除，手动删除该文件夹即可。

## ⚠️ 已知局限与说明

- AI 翻译默认调用 `deepseek-official` 的 `deepseek-flash` 模型，暂不支持自定义。
- 「打开配置文件夹」快捷按钮目前仅支持 Windows。
- 排版依赖 DSH 现有的 DOM 结构，如果 DSH 大版本更新发生底层变动，或安装了特殊 UI 插件，排版可能失效。

## 👨‍💻 关于作者
我是 [Lin-AxiomSight](https://github.com/Lin-AxiomSight)，一名即将毕业的学生。

这个项目诞生于我的日常痛点，也见证了我对 DSH 插件底层架构（Cordis）和 React 渲染的持续探索。

欢迎提交 Issue、PR，或是通过 GitHub 私信交流 DSH 插件开发相关心得。





---

## 📄 License

本项目基于 [MIT License](LICENSE) 发布。

MIT © Lin-AxiomSight
