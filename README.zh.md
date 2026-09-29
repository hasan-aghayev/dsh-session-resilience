---
description: "为 DSH 0.2+ Web 配置提供安全重启、原页面内重连和策略化会话恢复。"
kind: "package-bundle"
---

# DSH Session Resilience

[English](README.md) | 中文

## 摘要

DSH Session Resilience 让长时间运行的 Web 会话在本地 DSH 主机重启、断线、达到 token 上限或开始重复工作时继续可恢复。它把本地重启/停止按钮、由 Host 管理的自动接续、经过确认的原页面内重连、四种恢复策略、幂等护栏、自适应退避、循环保护和实时恢复面板放在一个插件中。

## 与同类插件的区别

- **恢复策略** — Safe、Balanced、Long task 和 Manual 会一起调整恢复窗口、冷却时间、重试上限、扫描范围和退避。Manual 会保留下方每个参数的编辑权。
- **原页面内重连** — 浏览器在后台交换替代 Host 的启动 token，再通过 DSH 连接服务主动重连，并等待新连接就绪后才报告成功。当前页面和未发送草稿会保留。
- **一个恢复中心** — 重启、停止、自动接续、循环保护、错误分类、通知、统计和暂停会话都在同一张设置卡里管理。
- **DSH 原生控制面板** — 设置卡使用 DSH 语义 token 和紧凑字段密度，并通过自定义模块栏和编号分组建立自己的界面，而不是再引入一套视觉主题。
- **不虚报成功** — 只有替代 Host 可以访问并且已经找到新的启动 URL 后，重启才会进入可连接状态。
- **少量模型接口** — 模型只看到 `restart_dsh` 和 `shutdown_dsh`；恢复策略和浏览器控制不进入模型提示词。
- **本地优先** — 重启标记、辅助进程日志和控制路由都留在 DSH 主机本地。插件没有分析统计或远程服务。

## 安装

### 包安装

将包安装到 DSH profile 使用的环境，把 `dsh-session-resilience` 加入 profile 的 bundle 列表，然后执行 profile 原本的 reconcile 流程。

Bundle patch 会插入 Host 和 Web 客户端条目。包中包含预构建的 `lib` 文件，因此从 GitHub 安装时不依赖本地 TypeScript 构建环境。

### GitHub 安装

本仓库用于作为公开版本的事实来源。加入 profile 时请固定到准确 commit；生产 profile 不要使用会移动的分支。

使用带 profile 参数的 DSH 命令安装或移除该 bundle：

```sh
dsh plugin --profile <profile> add https://github.com/hasan-aghayev/dsh-session-resilience
dsh plugin --profile <profile> remove dsh-session-resilience
```

### 更新已有安装

发布新版本不会替换 profile 的 `package.json` 中已固定的旧归档。如果 DSH 显示 `dsh-session-resilience: pending (waiting for service: settingsScope)`，说明该 profile 仍在使用会请求旧 settings 服务的 0.1.1 客户端。将 profile 更新到 0.1.10 并重启：

```sh
dsh plugin --profile web add -w https://github.com/hasan-aghayev/dsh-session-resilience/releases/download/v0.1.10/dsh-session-resilience-0.1.10.tgz
```

把 `web` 替换为实际 profile 名称。该 DSH 管理命令会更新固定的包 URL 和已安装文件；只把新版本加入目录不会更新已经安装的旧归档。

仓库 metadata 已经配置为这个公开 GitHub 仓库。完成本地检查后，可以通过 [dsh.pub/submit](https://dsh.pub/en/submit/) 提交公开 URL。目录服务会校验指定 commit 并生成可审计的目录 pull request；基于 Git 安装不要求先发布到 npm。

## 控制按钮

Web 侧边栏在状态指示灯旁保留两个紧凑控制：

- **重启** — 记录正在运行的根会话，在配置端口启动替代 DSH Host，并在原页面中重新建立连接。
- **停止** — 停止当前 DSH Host，不启动替代进程；当前页面保持打开但会断开连接。

状态指示灯读取 DSH 公共连接服务，不会通过 HTTP 持续轮询 Host。重启和停止会发送同源请求，并等待 DSH 确认已接收操作后再开始恢复。重启期间，辅助进程会读取新 Host 自己报告的实例 ID（而不是启动器进程 ID），并在发布启动 URL 前确认该 Host 已返回相同的一次性请求 ID。随后侧边栏会在当前来源后台交换启动 token，通过 DSH 公共连接服务主动重连，并等待新连接就绪后才报告成功。当前页面、视图和未发送的草稿都会保留。如果启动、认证或连接恢复超过各自的等待时限，按钮会显示错误；控制台只记录失败步骤和错误类型，不会记录启动 URL 或 token。若浏览器无法恢复连接，仍可手动刷新页面。

即使关闭自动恢复，设置卡仍会保留手动重启和停止控制。

## 恢复策略

| 策略 | 适用场景 | 默认行为 |
| --- | --- | --- |
| Safe | 短任务或敏感任务 | 5 分钟接力窗口、连续恢复 2 次、较小扫描范围 |
| Balanced | 日常工作 | 10 分钟接力窗口、连续恢复 3 次、中等退避 |
| Long task | 构建、导入和长时间 Agent 会话 | 30 分钟接力窗口、连续恢复 8 次、更宽扫描范围 |
| Manual | 精细调整 | 使用设置卡中的单项参数 |

策略是显式配置，不是运行时隐藏的默认回退。选择 Manual 后，单项字段拥有最终作用。初始 Manual 数值与 Balanced 相同，可以保持已有配置的行为。

## 安全行为

接续引擎只处理由机器中断、临时错误或 token 上限导致的回合。用户主动停止和被策略拦截的回合不会自动恢复。接续前，幂等护栏可以在工具结果未知时要求模型先确认状态，或在工具已经成功时提示模型不要重复执行。

认证、余额、模型不存在和上下文超限等永久错误会被跳过，也可以通过浏览器通知显示。连续失败会使用自适应退避，并在达到上限后停止。循环保护可以取消并改道处理重复工具调用或重复助手文本的回合。

## 设置

打开 **Settings → Plugins → DSH Session Resilience**。设置卡采用暂存编辑：先在界面校验，点击 Save 后才写入。单个字段的 Reset 会移除用户覆盖，回到部署默认值。

设置卡包含：

- 重启接力和重连窗口；
- 接续文本和输出上限文本；
- 工具结果安全护栏；
- 中断宽限期和冷却时间；
- 启动/重连扫描和临时错误分类；
- provider 可恢复错误片段和自适应退避；
- 浏览器通知和详细日志；
- 循环保护阈值；
- 今日统计和暂停会话控制。

## Model Experience

### 重启和停止工具

#### 模型看到的内容

用户要求重启 DSH 或当前任务明确需要重启时，模型可以调用 `restart_dsh`。只有用户明确要求停止时，模型才可以调用 `shutdown_dsh`。两个工具都接收空对象。重启结果包含实例、旧进程、端口、已记录的根会话和辅助日志路径。

#### Token 影响

两个工具的定义和结果文本使用当前模型请求正常的工具调用/结果 token。只有发生符合条件的中断后，自动恢复才会追加设置中的接续文本。

#### KV Cache 影响

插件不增加固定的系统提示词前缀。它对模型可见的内容只有两个工具定义、工具结果，以及触发恢复时的一条接续消息。

## 兼容性和限制

- 面向带有已发布 Cordis、tools、LLM、session 和 settings 包的 DSH Web profile。
- 0.1.3 版本已在 DeepSeek Harness `0.2.0-rc.2` 和 Node `24.18.0` 的全新 Web profile 中做过冒烟检查；插件成功加载，本地健康检查路由返回成功。其使用的接口也已对照该版本源码检查。
- 包 metadata 仍支持 DSH `>=0.1.0-rc.7 <0.2.0`，以及 `0.1.7-alpha.1` 到 `0.1.7` 这一发布线。
- 替代进程使用 profile 正常的 DSH Web 启动路径和配置端口；插件不会选择 GPU、模型或端口。
- 重启恢复需要根浏览器会话在接力窗口内重新连接。浏览器必须允许同源信标和 token 交换请求。
- 如果进程在写入重启标记之前就被强制结束，插件无法提供会话接力。
- 浏览器必须允许连接本地 DSH 启动 URL。浏览器策略、外部代理或主机级进程管理器仍可能阻止恢复。
- 某些 provider 错误可能需要填写精确的可恢复错误片段。过宽的片段可能重复请求，应避免使用。

## 开发和发布

由于 DSH 从 GitHub 安装时不假设本地 TypeScript 工具链，仓库会提交预构建的 `lib` 文件。运行完整的包检查：

```sh
npm run pack:check
```

验证脚本会检查 standalone 包身份、bundle patch、发布所需文件和 JavaScript 语法。artifact 测试会检查客户端注册、分离式重启辅助进程，以及本地状态桥的安全保护。GitHub workflow 会在每次 push 和 pull request 上重复包检查。匹配 `v*` 的版本 tag 会运行发布 workflow，检查 tag 与 `package.json` 版本一致，生成包归档并将其附加到 GitHub Release。

提交到 DSH Plugin Market 时，使用一个公开仓库，并保证仓库根目录包含本 `package.json`、`cordis.patch.yml`、README、许可证和预构建的 `lib` 文件。将自己的条目添加到 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的 `data/plugins/hasan-aghayev__dsh-session-resilience.yml`，再跟随目录 pull request。为了可复现安装，请使用 `dsh plugin add https://github.com/hasan-aghayev/dsh-session-resilience` 并在 profile 中固定准确的 commit。每个版本 tag 也会生成 GitHub Release 归档。

## 许可证和说明

MIT。本项目是独立的社区插件，与 DeepSeek AI 没有隶属关系。插件使用 DSH 的公开扩展点，不修改 DSH agent loop。
