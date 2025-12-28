<!-- Background -->
你做的很好。

我在你的基础上进行了修改，调整，并发起两次提交。

- ♻️ refactor: 重构；全局替换为 Message V2 以及新的 tree model; 基本可运行，有细微 bug (281a43c4244b474eac6747ef848751396d43a42f)
- 🐛 fix: multi version 异常 (3cc15057dd3d03e56e5d4fb1570ff5db70fde989)

目前我简单在思源中测试，功能基本 OK，可以对话，也可以导入过去的历史记录
（没有深入测试）

<!-- 调整 spec 计划 -->

1. 我注意到 Phase 4 当中有很多测试，但是我不认为有必要全部弄完
   - 你阅读 Phase 4 ，过滤出你认为非常重要 Vital 的测试项目呈现出报告给我，我会后面自行离线测试的，Phase 4 就直接跳过
2. Phase 5.2 Version 问题不大
3. 5.1 很重要；branch 功能现在完全重构之后：要实现新的 new branch，新的分支功能将基于 tree mode ，新开一个新的分支、新的世界线；具体方案参考后面的 [[new branch]] 小节
4. 5.4 的 worldline 可以直接复用当前的 session managerment，无非就是展示所有 message 的信息；旧版本选择消息并提取为新对话的功能要保留
5. Phase 6 中很多任务可能已经完成了，需要你 check
6. 需要一个新的功能：Tree Visualization，详情见 [[view tree]]

<!-- new branch -->

```
原始状态:
worldLine = [U1, A1, U2, A2, U3, A3]
节点关系: U1 → A1 → U2 → A2 → U3 → A3

在 A1 处创建分支后:
worldLine = [U1, A1]
A1.children = [U2]  // 保持不变

用户输入新问题后:
worldLine = [U1, A1, U2']
A1.children = [U2, U2']  // 自然增长
```

> [!WARNING]
> 旧版本 createMessageBranch 是 version + truncate 的混合操作，语义混乱；它将被移除，其功能由 forkAt + 正常的 appendNode 流程替代。

- src/func/gpt/chat/components/MessageItem.tsx 中的 createNewBranch 需要重构，和新的 src/func/gpt/chat/ChatSession/ 底层结合起来
- 新的 New branch:

    1. MessageItem 调用 new branch
    2. 通过 session 透传会 tree-model
    3. tree-model 实现新的 forkAt (注意原本存在的 createBranch 不可用，逻辑不对)
        ```ts
        // use-tree-model.ts
        /**
        * 在指定节点处创建分支（截断 worldLine）
        * @param atId 分支起点节点 ID
        * @returns 分支起点 ID，失败返回 null
        */
        const forkAt = (atId: ItemID): ItemID | null => {
            const atNode = nodes()[atId];
            if (!atNode) return null;

            const atIndex = worldLine().indexOf(atId);
            if (atIndex === -1) return null;

            // 截断 worldLine 到 atId（包含 atId）
            worldLine.update(prev => prev.slice(0, atIndex + 1));

            return atId;
        };
        ```
    4. 此后 appendNode 会自然地：
        取 worldLine 末尾（即 atId）作为 parentId
        新节点成为 atId 的子节点
        worldLine 延伸到新节点
- 在 tree-model 中新增
```ts
interface ITreeModel {
    // ... 现有方法 ...

    // 分支操作
    /** 在指定节点处截断 worldLine，准备创建分支 */
    forkAt: (atId: ItemID) => ItemID | null;
    
    /** 获取节点的分支数（children 数量） */
    getBranchCount: (id: ItemID) => number;
    
    /** 判断节点是否有多个分支 */
    hasMultipleBranches: (id: ItemID) => boolean;
}
```
- session 中新增 | (原本的 createMessageBranch 不对，去掉)
```ts
// use-chat-session.ts

const createBranch = (at: MessageLocator) => {
    const item = hooks.getMessageAt(at);
    if (!item) return null;
    
    const branchId = treeModel.forkAt(item.id);
    if (!branchId) return null;
    
    renewUpdatedTimestamp();
    
    // 返回分支起点 ID，UI 可以据此做后续处理
    return branchId;
};
```


- 分支指示器: 设计方案为，在 MessageItem 中，如果有分支，在最下方显示一行美观得体的标识，可以增加点击切换到别的世界线的功能；位置在 MessageToolbar 的下方，独立一条线，仿照常见 Cursor, Copilot 中 Checkpoint 线的设计方案 
- 切换世界线
  - 手动指定：指定某个 leaf 作为 endpoint 的世界线切换（后面会详细说，这个需要设计新 UI，参考 [[view tree]]）
  - 自动切换，在 node 切换世界线，自动用 dfs 搜索下一条直通 leaf 的世界线；在 node 层级相当于是循环遍历 children ，而后续的节点如果还有分支，最简单的方案就是只选择第一个 children

Note: src/func/gpt/chat/components/MessageItem.tsx 中目前有 `BranchIndicator`，这个是上一个版本的旧功能，新版废弃，但是保留 UI 做兼容；可以改名为 `LegacyBranch`

<!-- view tree -->

为了更好的管理 Chat Tree，需要创建一个 UI 组件：

- 可视化整个图节点
- 点击查看节点的详细信息
- 点击切换激活世界线
- 更高级的操作： tree branch 剪裁、拼接等（放到 future 展望里）

实现：

为了避免让插件打包过大，建议使用插件的 html-page 方案实现
外部注入必要的 SDK，然后将 html 作为同源 iframe 显示在思源中

<!-- 下一步 -->

- 优先：实现 new branch 核心功能
  - 数据逻辑层：新建分支
  - MessageItem：展示 branch indicator
  - 点击自动切换世界线
- 检查 openspec 当前的规范；结合我的意见调整 spec 的状态
- HTML Page 的 Tree UI 将会留到下一个 Copilot Session 实现

