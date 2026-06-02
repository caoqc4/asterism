# asterism

[English](README.md) | 简体中文

**Record, execute, and compound your business with a local-first AI desktop app.**<br>
**记录决策，推进执行，让你的事业系统持续升级。**

asterism 让严肃工作不再散落在一次性聊天里。Business、任务、决策、运行记录、复盘、来源上下文和产物都属于本地控制层；更高风险的 Agent 动作需要明确闸门，而不是默认自动执行。

- 把原因、内容、证据和下一步留在工作本身。
- 从 Business -> Next Action -> Agent run -> Review 推进，不丢上下文。
- 把 Agent 输出视为证据和待确认建议，而不是静默写入产品状态。
- 今天即可从源码本地运行；不依赖 hosted service 或官方签名包。

## Source-only Alpha（仅源码分发）

asterism 目前只以源码形式分发。项目还没有提供官方签名/公证的二进制安装包，也没有 auto-update channel。

当前 alpha 状态见：[Public alpha readiness](docs/PUBLIC_ALPHA_READINESS.md)。

本地快速路径：

```bash
npm install
npm run rebuild:electron
npm run dev
```

如果想严格按照 `package-lock.json` 做干净安装，可以用 `npm ci` 替代
`npm install`。

如果之后要在同一个 checkout 里跑 Node/Vitest 验证，请先用
`npm run rebuild:node` 切回 Node ABI。

如果想在自己的机器上生成一个本地 unpacked macOS app：

```bash
npm run dist:mac:dir
open release/mac-arm64/Asterism.app
```

这个本地 app 没有签名/公证，可能触发 macOS 警告。

## 它帮你做什么

- 记录决策、上下文、阻塞和完成标准，趁工作现场还清楚时沉淀下来。
- 用带闸门的 Agent 辅助推进任务，而不是放任自动化直接改动。
- 把运行记录、证据、复盘和产物留在它们影响的工作旁边。
- 在一轮轮记录、执行、复盘中持续升级你的工作系统。

## 工作闭环

**闭环：** 记录决策与上下文 -> 推进带闸门的任务执行 -> 复盘证据与结果 -> 升级事业系统。

## 架构速览

| 层 | 作用 |
| --- | --- |
| React renderer | 展示 Today、Business、Chat、Decisions 和审核界面，不直接访问数据或 secrets。 |
| Typed preload IPC | 让 renderer 到 main 的调用保持显式、可校验。 |
| Electron main services | 承载领域服务、调度任务、运行编排和 writeback 闸门。 |
| 本地存储 | SQLite 保存任务/业务记录；OS keychain 保存敏感 provider 配置。 |
| Agent/workspace gates | Provider 调用和会改动工作区的流程保持 opt-in、可审核。 |

## 当前状态

asterism 目前是 alpha 阶段的 Electron + React + TypeScript 应用。它适合本地开发和实验使用，但还不是打磨完成的生产版本，也不是稳定的终端用户发行版。

仓库在准备公开界面的过程中，可能仍包含产品规划材料和内部架构笔记。当前公开策略见 [Open source strategy](docs/OPEN_SOURCE_STRATEGY.md)。
当前 alpha 能力、风险和验证口径见 [Public alpha readiness](docs/PUBLIC_ALPHA_READINESS.md)。

## 为什么是 asterism

AI 辅助工作很容易散落在聊天、文件、issue tracker、笔记和终端日志里。时间一久，就很难恢复当时为什么要改、用了哪些证据、哪个决策还没拍板，以及下一步最值得做什么。

asterism 把任务视为持久的控制层。Agent 运行、人类决策、来源上下文、产物和验证结果都会回到对应工作上，并且对高风险操作保留明确闸门。

## 功能

- 结构化任务记录：状态、下一步、阻塞、依赖、完成标准、来源上下文和产物。
- 面向任务恢复的 Home 界面：按紧急度、阻塞、决策、近期活动和收尾准备度找回工作。
- 与任务关联的决策草稿和审批。
- Agent 运行记录：把证据、失败、输出和验证结果留在任务附近，而不是临时对话里。
- 本地 SQLite 存储产品数据，renderer 通过 typed IPC 边界访问。
- 通过 OS keychain 保存 provider 凭据和其他敏感本地配置。
- 对更高风险的 Agent 能力和工作区变更流程使用显式本地控制。

## Local-first 与安全姿态

默认姿态是 local-first，并且需要显式选择：

- renderer 不直接访问 SQLite 或 secrets；
- 除非已配置 provider 且用户动作明确请求，否则不会调用 provider；
- Docker-backed 或会修改工作区的流程需要匹配的 feature gate 和用户确认；
- 常规本地验证不会进行签名、公证、上传或 Apple 网络动作。

`package.json` 保留 `"private": true` 是为了防止误发 npm 包。这个 npm 安全开关不代表 GitHub 仓库不能公开。

## 技术栈

- Electron
- React + Vite + TypeScript
- SQLite + Drizzle ORM
- `node-cron`
- Vercel AI SDK
- OS keychain via `keytar`

## 项目结构

```text
src/
  main/       Electron main process: DB, domain services, scheduler, executors, IPC
  renderer/   React UI
  shared/     shared contracts and types
docs/         public developer documentation
scripts/      local verification, smoke, and release helper scripts
```

## Getting Started

需要 Node `20.19+` 或 `22.12+`，以及 npm `10+`。

```bash
npm install
npm run rebuild:electron
npm run dev
```

`dev` 命令会启动 Vite renderer server、Electron main-process TypeScript watcher，以及 Electron desktop shell。
如果之后要在同一个 checkout 里跑 Node/Vitest 命令，请先用 `npm run rebuild:node` 切回 Node ABI。

首次打开后，即使还没有配置 AI Runtime，也可以先使用本地记录、Business 和 Tasks。
要执行 Agent run，需要在 AI Runtime 页连接已登录的 Codex CLI / Claude Code，
或选择性配置 Provider/API。

## 常用命令

```bash
npm run lint
npm run test
npm run build
npm run verify:alpha
npm run verify
```

`npm run verify:alpha` 是 source-only alpha 面向公开贡献者的快速检查。
它会运行 production dependency audit、类型检查、公开产品审计测试、产品进度审计、
production build 和 whitespace diff 检查。如果刚跑过 Electron native rebuild，
请先运行 `npm run rebuild:node` 再执行 Node/Vitest 命令。

`npm run verify` 会运行测试、类型检查和 production build。

打包相关检查：

```bash
npm run smoke:build
npm run dist:mac:dir
npm run smoke:release:mac
npm run accept:packaged-recovery:mac
npm run accept:release:mac-preflight
```

macOS release 命令目前验证的是本地 unsigned/ad-hoc packaging。签名和公证发行需要单独配置凭据，不属于默认本地验证路径。

## 文档

- [Documentation index](docs/README.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Safety model](docs/SAFETY_MODEL.md)
- [Configuration](docs/CONFIGURATION.md)
- [Development](docs/DEVELOPMENT.md)
- [Public alpha readiness](docs/PUBLIC_ALPHA_READINESS.md)
- [Testing](docs/TESTING.md)
- [Releases](docs/RELEASES.md)
- [Open source strategy](docs/OPEN_SOURCE_STRATEGY.md)

## 尚未准备好

- 官方二进制发行、签名、公证和更新通道。
- 稳定的 plugin 或 extension API。
- Hosted sync、团队协作或企业 connector。
- 最终确定的公开支持与安全联系机制。
- 对所有历史规划笔记完成完整 public-readiness 检查。

## License

asterism 使用 [MIT License](LICENSE) 发布。

## 贡献与安全

- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
