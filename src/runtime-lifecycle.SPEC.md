# FMisc Runtime Lifecycle Specification

**Module**: [`src/runtime-lifecycle.ts`](./runtime-lifecycle.ts)  
**Scope**: fmisc 单个前端 JavaScript realm 内，SiYuan Plugin callback 与 settings/feature 生命周期之间的协调。  
**Upstream baseline**: SiYuan v3.7.0, commit `27e0051e0d067892e833df1063cb2fb469600e98`。

## Purpose

`FMiscRuntimeLifecycle` 将 SiYuan 的同步 callback 映射为确定的 fmisc 内部顺序：

```text
settings 初始化
→ feature modules 启动
→ 接收并处理 storage sync notification
→ settings 与 feature modules 有序停止
```

它只协调顺序和取消信号，不读取设置文件、不决定配置冲突、不实现具体模块资源管理。

## External Constraints

参考 SiYuan (v3.7.0) 行为：

1. 初次加载时，SiYuan 将 Plugin 实例加入 `app.plugins` 后才等待其异步 `onload()`；初始化期间可能找到该实例并调用 `onDataChanged()`。  
   来源：[loader.ts L31-L45](https://github.com/siyuan-note/siyuan/blob/27e0051e0d067892e833df1063cb2fb469600e98/app/src/plugin/loader.ts#L31-L45)、[loader.ts L48-L79](https://github.com/siyuan-note/siyuan/blob/27e0051e0d067892e833df1063cb2fb469600e98/app/src/plugin/loader.ts#L48-L79)。
2. `onDataChanged()` 是无文件路径参数的同步 callback；SiYuan 不等待其中派生的异步工作。  
   来源：[loader.ts L241-L277](https://github.com/siyuan-note/siyuan/blob/27e0051e0d067892e833df1063cb2fb469600e98/app/src/plugin/loader.ts#L241-L277)。
3. SiYuan 同步调用 `onunload()`，随后销毁并移除旧 Plugin 实例，不等待返回的 Promise。  
   来源：[uninstall.ts L16-L85](https://github.com/siyuan-note/siyuan/blob/27e0051e0d067892e833df1063cb2fb469600e98/app/src/plugin/uninstall.ts#L16-L85)。

这些来源证明 callback 缺少显式异步串行保证；它们不说明相关重叠在实际使用中的发生频率。

## Lifecycle Contract

```mermaid
stateDiagram-v2
    [*] --> created
    created --> loading-settings: load()
    loading-settings --> loading-features: settings ready
    loading-features --> active: features settled
    created --> disposed: unload()
    loading-settings --> disposed: unload()
    loading-features --> disposed: unload()
    active --> disposed: unload()
```

### `load()`

- 幂等：重复调用返回同一个 startup Promise。
- 初始化 settings 前，必须等待同一 JavaScript realm 中上一代 fmisc runtime 的 teardown barrier。
- settings 成功初始化后才能启动 feature modules。
- feature startup settle 后才能进入 `active`。
- 若在任一 await 期间进入 `disposed`，不得继续进入后续状态或触发 reconciliation。
- settings 初始化或顶层 feature startup 的未隔离错误可使 `load()` reject；本模块不伪造成功状态。

### Storage notification

- `created`、`loading-settings`、`loading-features`：只保留一个 pending notification。
- `active`：立即转交 `SettingsPersistence.scheduleReconcileAfterStorageSync()`；实际并发合并由 settings persistence 负责。
- 进入 `active` 时，最多 flush 一次初始化期间累计的 notification。
- `disposed`：忽略全部 notification。

该 notification 表示插件 storage 的一个同步 merge batch，不代表单个文件。文件识别和配置 apply 不属于本模块。

### `unload()`

`unload()` 必须先同步完成以下状态变化，再返回 teardown Promise：

1. 状态变为 `disposed`；
2. 清除 pending storage notification；
3. abort feature startup signal；
4. 调用 settings persistence 的 `dispose()`，阻止新 reconciliation/Enable transition。

之后 teardown Promise 按顺序收束：

```text
startup settle + settings disposal settle
→ aggregate feature unload
→ teardown barrier resolve
```

- 重复调用 `unload()` 返回同一个 Promise。
- settings disposal、startup settlement 或 feature unload 的错误必须被记录并包含在 teardown 内，避免未处理 rejection。
- 只有 feature startup 已开始时才调用 aggregate feature unload。
- SiYuan 不等待该 Promise；内部顺序依赖本模块维护，不能依赖上游 callback await。

## Cross-Generation Barrier

模块使用 `globalThis[Symbol.for('sy-f-misc.runtime-lifecycle.teardown')]` 发布当前 generation 的 teardown Promise。下一 generation 在 settings 初始化前等待该 Promise，防止两代 Plugin 同时操作模块级 singleton 状态。

合同边界：

- 只串行化同一 JavaScript realm 中使用相同 barrier key 的 fmisc generation。
- 不跨窗口、进程或设备同步状态。
- 测试可注入独立 symbol，生产代码应使用默认 key。
- 改变或删除 barrier 前，必须审计所有 module-level `enabled`、全局 store、timer 和资源注册是否已改为实例所有。

## Feature Startup Cancellation

`loadFeatures(signal)` 接收一个 `AbortSignal`：

- `unload()` 必须同步 abort。
- signal 不会自动取消网络或文件请求；它只阻止请求完成后的新资源注册。
- 任何 feature `load()` 若在 `await` 后注册菜单、命令、Dock、event listener、timer、socket 或全局入口，必须在副作用前检查 `signal.aborted`。
- 已在 abort 前注册的资源由 aggregate feature `unload()` 清理。
- 单个 module load/unload 失败应由 aggregate lifecycle 按模块名记录，不阻止其他模块 settle。

当前需要 post-await guard 的模块包括 GPT、Toggl、WebSocket 和 HTML Pages。新增或修改异步 module startup 时必须重新执行此审计。

## Collaborator Ownership

| Owner | Owns | Must not own |
|---|---|---|
| `FMiscRuntimeLifecycle` | 状态、startup ordering、pending notification、abort、跨 generation teardown | 配置 schema、snapshot/conflict decision、模块资源细节 |
| `SettingsPersistence` | 文件读取、snapshot、session runtime precedence、reconciliation queue、Enable transition drain | feature startup ordering |
| `src/func/index.ts` | aggregate module load/unload、单模块错误隔离、startup signal 传递 | SiYuan callback 状态 |
| Feature module | 自身资源注册/清理、跨 await 的 abort guard | 全局 sync/reconciliation policy |
| `FMiscPlugin` | 创建协调器并转发 `onload`/`onDataChanged`/`onunload` | pending/ready/disposed 状态机 |

## Compatibility and Non-Goals

本模块不得改变：

- `configs.json`、`custom-module.config.json`、`gpt.config.json`、`toggl.json` 或 `zoteroDir.config.json` 的文件名、schema、migration、导入/导出和 debounce；
- GPT cache/history 的持久化语义；
- SiYuan 对插件代码更新、启用和禁用执行完整 reload 的行为；
- settings scope 的冲突策略。

本模块不提供跨设备互斥、JSON 字段合并、概率性冲突解决或对任意异步任务的强制取消。

## Required Regression Checks

修改状态或 teardown 逻辑后至少执行：

```bash
pnpm run test:runtime-lifecycle
pnpm run type-check
pnpm run build:publish
git diff --check
```

生命周期测试必须继续覆盖：初始化通知合并、active notification、startup 中 teardown、settings drain、跨 generation barrier、settings 初始化中 teardown，以及单模块失败隔离。真实 SiYuan 双设备同步仍需应用内验收，mock 测试不能替代。
