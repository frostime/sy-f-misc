# quick-input Runtime Verification Report

- **Tester**: subagent-mimo
- **Date**: 2026-06-25
- **Target**: dev workspace (`20231224140619-bpyuay4` / Test notebook)
- **Method**: siyuan-cli (kernel API direct)
- **Test doc**: `20260625020759-kbr4c8p` (`/quick-input-runtime-test`)

---

## V-1: IAL 解析为块属性

| Item | Detail |
|------|--------|
| API | `block.appendBlock` → `attr.getBlockAttrs` |
| Input | `quick-input IAL test\n{: custom-qi-test="1"}` |
| Block ID | `20260625020808-5euh5ov` |
| Result | `custom-qi-test=1` |
| **Pass** | ✅ |

**结论**: 内核正确解析 kramdown IAL 为块属性。可用于 quick-input，但属于"用户自担能力"，不建议作为设置块属性的唯一手段。

---

## V-2: createDocWithMd 父路径缺失行为

| Item | Detail |
|------|--------|
| API | `filetree.createDocWithMd` |
| Input | notebook=`20231224140619-bpyuay4`, hpath=`/quick-input-runtime-test-v2/parent-missing/child-doc` |
| Doc ID | `20260625020822-n1yv5mt` |
| Full hpath | `Test/quick-input-runtime-test-v2/parent-missing/child-doc` |
| **Pass** | ✅ |

**结论**: 内核自动创建中间路径文档（`parent-missing`）。quick-input engine 无需额外处理父路径缺失。

---

## V-3: createDocWithMd 同 hpath 已存在行为

| Item | Detail |
|------|--------|
| API | `filetree.createDocWithMd` × 2 |
| Input | notebook=`20231224140619-bpyuay4`, hpath=`/quick-input-runtime-test-v3/same-name` |
| 1st call | ID `20260625020834-76ieh91`, markdown `# first version` |
| 2nd call | ID `20260625020840-z8mnqj5`, markdown `# second version` |
| Behavior | 静默创建新文档，不报错、不覆盖 |
| `getIDsByHPath` | 返回两个 id: `76ieh91`, `z8mnqj5` |
| **Pass** | ✅ |

**结论**: 内核允许同 hpath 重复文档并存，各自独立。⚠️ quick-input 需在 UI/engine 层加同路径检查或提示，避免用户反复创建累积重复文档。

---

## 总结

| Item | Status | 实现建议 |
|------|--------|----------|
| V-1 IAL | ✅ | 可用，但 post-insert `setBlockAttrs` 更可靠 |
| V-2 父路径 | ✅ | 无需额外处理 |
| V-3 同路径 | ⚠️ | 需 UI 层同路径检查/确认提示 |
