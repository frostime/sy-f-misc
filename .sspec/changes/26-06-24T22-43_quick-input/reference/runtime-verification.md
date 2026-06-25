# quick-input Runtime Verification

这些检查需要在真实 SiYuan + sy-f-misc dev 插件环境中执行。Agent 不把这些作为自身可完成验证；它们是用户/开发者 runtime check。

## 前置条件

1. 启动构建：`pnpm run dev`
2. 在 SiYuan 中加载 sy-f-misc 开发插件
3. 打开至少一个笔记本，并准备：
   - 一个测试 notebook id（下文记为 `<NB>`）
   - 一个测试文档块 id（下文记为 `<DOC_ID>`）
   - 一个测试 heading/段落块 id（下文记为 `<ANCHOR_ID>`）
4. 在思源开发者控制台可访问插件 API 或全局调试入口（实现完成后可通过 quick-input UI 验证；也可临时从 console 调用内核 API）

> 建议在临时测试笔记本中执行，避免污染真实数据。

## V-1: IAL 解析为块属性

**目标**：确认 markdown 中的 kramdown IAL 会被内核解析为块属性。

步骤（控制台或临时调试入口）：

```js
const { appendBlock, getBlockAttrs } = await import('/plugins/sy-f-misc/index.js').catch(() => ({}));
// 若无法直接 import，请用实现后的 quick-input 预设或插件暴露的临时调试函数执行等价 API。
```

等价操作：

```ts
const ops = await appendBlock('markdown', 'quick-input IAL test\n{: custom-qi-test="1"}', '<DOC_ID>');
const newBlockId = ops?.[0]?.doOperations?.find(op => op.id)?.id;
const attrs = await getBlockAttrs(newBlockId);
console.log(attrs['custom-qi-test']);
```

期望：

```text
attrs['custom-qi-test'] === '1'
```

若失败：
- 不能依赖模板 IAL 设置块属性；需要改回 post-insert `setBlockAttrs` 或明确 IAL 仅作为用户自担能力。

## V-2: createDocWithMd 父路径缺失行为

**目标**：确认目标 hpath 中父路径不存在时，内核是否自动创建中间文档。

步骤：

```ts
const docId = await createDocWithMd('<NB>', '/quick-input-runtime-test/parent-missing/child-doc', '# quick input parent missing');
console.log(docId);
```

期望：
- 返回一个 docId；
- 文档树中出现 `/quick-input-runtime-test/parent-missing/child-doc`；
- 若父路径未自动创建或 API 报错，quick-input 需在 UI/engine 中提示用户先创建父路径，或补充父路径创建逻辑。

## V-3: createDocWithMd 同 hpath 已存在行为

**目标**：确认同路径文档已存在时，内核行为是覆盖、报错、创建同名/后缀，还是返回既有文档。

步骤：

```ts
const path = '/quick-input-runtime-test/same-name';
const first = await createDocWithMd('<NB>', path, '# first');
const second = await createDocWithMd('<NB>', path, '# second');
console.log({ first, second });
```

期望记录：
- `first === second` 还是不同 id；
- 原内容是否被覆盖；
- 文档树显示是否有同名/后缀。

实现策略依据：
- 若覆盖：setting/engine 应提示同路径会覆盖，后续可加确认；
- 若报错：engine 捕获并 showMessage；
- 若返回既有或新建后缀：按内核默认行为接受。

## Block mode: append/prepend/before/after

**目标**：确认 quick-input 的 mode 映射到正确插入位置。

准备：在测试文档中建立 anchor 块 `<ANCHOR_ID>`，最好已有若干子块和相邻兄弟块。

预设/等价调用：

```ts
await appendBlock('markdown', 'append child', '<ANCHOR_ID>');
await prependBlock('markdown', 'prepend child', '<ANCHOR_ID>');
await insertBlock('markdown', 'before sibling', '<ANCHOR_ID>'); // nextID = anchor → 插入到 anchor 前
await insertBlock('markdown', 'after sibling', undefined, '<ANCHOR_ID>'); // previousID = anchor → 插入到 anchor 后
```

期望：
- `append`：成为 `<ANCHOR_ID>` 的末尾子块；
- `prepend`：成为 `<ANCHOR_ID>` 的首个子块；
- `before`：成为 `<ANCHOR_ID>` 前一个同级块；
- `after`：成为 `<ANCHOR_ID>` 后一个同级块。

## UI Check: quick-input MVP

实现完成后用 UI 验证：

1. 设置 → `💡 QuickInput` 独立 Tab：新增 document 预设，hpath 使用 `${title}`，template 使用 `${title}` + IAL。
2. 启用模块 → `Alt+I`：面板出现该预设；填表后创建文档并打开。
3. 新增 block 预设：`anchorId` 填 `<ANCHOR_ID>`，mode 分别测试 append/prepend/before/after。
4. 新增日记快捷预设：使用 setting 的“插入今日日记”快捷填充，验证会创建/定位今日日记并 append。
5. 重启插件或 SiYuan，确认 `quick-input.templates` 持久化。
