/**
 * editor.ts 测试套件 - 纯 JavaScript 版本
 * 
 * 运行: node editor-test-node.js
 */

// ============================================================
// 核心逻辑（从 editor.ts 提取并转换为 JS）
// ============================================================

function normalizeForMatch(s) {
    return s
        .replace(/\r\n/g, '\n')         // 统一换行符
        .replace(/\t/g, '  ')           // Tab 转 2 空格
        .replace(/\s+$/gm, '')          // 移除行尾空白
        .replace(/[ ]+/g, ' ')          // 多个空格压缩为一个
        .trim();
}

function similarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const maxLen = Math.max(a.length, b.length);
    if (maxLen > 1000) {
        const aWords = new Set(a.split(/\s+/));
        const bWords = new Set(b.split(/\s+/));
        const intersection = [...aWords].filter(w => bWords.has(w)).length;
        const union = new Set([...aWords, ...bWords]).size;
        return union > 0 ? intersection / union : 0;
    }

    const matrix = [];
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    const distance = matrix[a.length][b.length];
    return 1 - distance / maxLen;
}

function findBlockInLines(fileLines, searchLines, range) {
    const results = [];

    const startLine = Math.max(0, ((range && range.startLine) || 1) - 1);
    const endLine = Math.min(fileLines.length, (range && range.endLine) || fileLines.length);

    const searchText = searchLines.join('\n');
    const searchNormalized = normalizeForMatch(searchText);
    const searchLen = searchLines.length;

    if (searchLen === 0) return results;

    let hasExactOrNormalized = false;

    // 第一遍：找精确和标准化匹配
    for (let i = startLine; i <= endLine - searchLen; i++) {
        const windowLines = fileLines.slice(i, i + searchLen);
        const windowText = windowLines.join('\n');

        if (windowText === searchText) {
            results.push({
                found: true,
                startIdx: i,
                endIdx: i + searchLen,
                matchType: 'exact',
                confidence: 1.0
            });
            hasExactOrNormalized = true;
            continue;
        }

        const windowNormalized = normalizeForMatch(windowText);
        if (windowNormalized === searchNormalized) {
            results.push({
                found: true,
                startIdx: i,
                endIdx: i + searchLen,
                matchType: 'normalized',
                confidence: 0.95
            });
            hasExactOrNormalized = true;
        }
    }

    // 如果已找到精确/标准化匹配，不再进行模糊匹配
    if (hasExactOrNormalized) {
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    // 第二遍：模糊匹配（仅当没有精确匹配时）
    if (searchLines.length >= 3) {
        for (let i = startLine; i <= endLine - searchLen; i++) {
            const windowLines = fileLines.slice(i, i + searchLen);
            const windowText = windowLines.join('\n');
            const windowNormalized = normalizeForMatch(windowText);

            const sim = similarity(windowNormalized, searchNormalized);
            if (sim > 0.92) {
                results.push({
                    found: true,
                    startIdx: i,
                    endIdx: i + searchLen,
                    matchType: 'fuzzy',
                    confidence: sim
                });
            }
        }
    }

    results.sort((a, b) => b.confidence - a.confidence);

    // 去重
    const seen = new Set();
    const dedupedResults = [];
    for (const r of results) {
        if (!seen.has(r.startIdx)) {
            seen.add(r.startIdx);
            dedupedResults.push(r);
        }
    }

    return dedupedResults;
}

function findUniqueMatch(fileLines, searchLines, range) {
    const matches = findBlockInLines(fileLines, searchLines, range);

    if (matches.length === 0) {
        return { match: null, error: '未找到匹配的代码块' };
    }

    const highConfidenceMatches = matches.filter(m => m.confidence > 0.9);
    if (highConfidenceMatches.length > 1) {
        const locations = highConfidenceMatches
            .map(m => `第 ${m.startIdx + 1} 行`)
            .join(', ');
        return {
            match: null,
            error: `发现 ${highConfidenceMatches.length} 个匹配位置（${locations}），无法确定修改哪一个`
        };
    }

    return { match: matches[0] };
}

function parseSearchReplaceBlocks(text) {
    const blocks = [];
    const blockRegex = /<<<<<<<?(?:\s*SEARCH)?\s*\n([\s\S]*?)\n?={4,}\s*\n([\s\S]*?)\n?>>>>>>>?(?:\s*REPLACE)?/g;

    let match;
    while ((match = blockRegex.exec(text)) !== null) {
        blocks.push({
            search: match[1].replace(/^\n+|\n+$/g, ''),
            replace: match[2].replace(/^\n+|\n+$/g, '')
        });
    }

    return blocks;
}

function parseUnifiedDiffRelaxed(diffText) {
    const lines = diffText.split('\n');
    const hunks = [];
    let current = null;
    let inHunk = false;

    for (const line of lines) {
        if (line.match(/^@@\s.*\s*@@/) || line.match(/^@@\s*@@/)) {
            if (current && (current.oldContent.length > 0 || current.newContent.length > 0)) {
                hunks.push(current);
            }
            current = { oldContent: [], newContent: [] };
            inHunk = true;
            continue;
        }

        if (!current || !inHunk) continue;

        if (line.startsWith('-')) {
            current.oldContent.push(line.substring(1));
        } else if (line.startsWith('+')) {
            current.newContent.push(line.substring(1));
        } else if (line.startsWith(' ')) {
            current.oldContent.push(line.substring(1));
            current.newContent.push(line.substring(1));
        } else if (line === '' && (current.oldContent.length > 0 || current.newContent.length > 0)) {
            current.oldContent.push('');
            current.newContent.push('');
        }
    }

    if (current && (current.oldContent.length > 0 || current.newContent.length > 0)) {
        hunks.push(current);
    }

    // 清理尾部空行
    for (const hunk of hunks) {
        while (hunk.oldContent.length > 0 && hunk.oldContent[hunk.oldContent.length - 1] === '') {
            hunk.oldContent.pop();
        }
        while (hunk.newContent.length > 0 && hunk.newContent[hunk.newContent.length - 1] === '') {
            hunk.newContent.pop();
        }
    }

    return hunks;
}

// ============================================================
// 测试框架
// ============================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        testsFailed++;
    }
}

function assertEqual(actual, expected, message) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (pass) {
        console.log(`  ✓ ${message}`);
        testsPassed++;
    } else {
        console.log(`  ✗ ${message}`);
        console.log(`    Expected: ${JSON.stringify(expected)}`);
        console.log(`    Actual:   ${JSON.stringify(actual)}`);
        testsFailed++;
    }
}

function testSection(name) {
    console.log(`\n=== ${name} ===`);
}

// ============================================================
// 测试用例
// ============================================================

console.log('Editor.ts 测试套件\n');

// ---------- 测试 1: SearchReplace 解析器 ----------
testSection('SearchReplace 解析器');

{
    const input = `
<<<<<<< SEARCH
function foo() {
  return 1;
}
=======
function foo() {
  return 2;
}
>>>>>>> REPLACE
`;
    const blocks = parseSearchReplaceBlocks(input);
    assertEqual(blocks.length, 1, '解析单个块');
    assert(blocks[0].search.includes('return 1'), '正确解析 search 内容');
    assert(blocks[0].replace.includes('return 2'), '正确解析 replace 内容');
}

{
    const input = `
<<<<<<< SEARCH
const a = 1;
=======
const a = 2;
>>>>>>> REPLACE

<<<<<<< SEARCH
const b = 3;
=======
const b = 4;
>>>>>>> REPLACE
`;
    const blocks = parseSearchReplaceBlocks(input);
    assertEqual(blocks.length, 2, '解析多个块');
}

{
    const input = `
<<<<<<<
old code
=======
new code
>>>>>>>
`;
    const blocks = parseSearchReplaceBlocks(input);
    assertEqual(blocks.length, 1, '解析简化格式');
}

{
    const input = `
<<<<<<< SEARCH
// delete me
=======
>>>>>>> REPLACE
`;
    const blocks = parseSearchReplaceBlocks(input);
    assertEqual(blocks.length, 1, '解析删除操作');
    assertEqual(blocks[0].replace, '', 'replace 为空');
}

// ---------- 测试 2: Unified Diff 解析器 ----------
testSection('Unified Diff 解析器');

{
    const diff = `
@@ -10,5 +10,3 @@
 context line
-removed line
+added line
 context end
`;
    const hunks = parseUnifiedDiffRelaxed(diff);
    assertEqual(hunks.length, 1, '解析单个 hunk');
    assertEqual(hunks[0].oldContent.length, 3, 'oldContent 正确');
    assertEqual(hunks[0].newContent.length, 3, 'newContent 正确');
}

{
    const diff = `
@@ ... @@
 context
-old
+new
`;
    const hunks = parseUnifiedDiffRelaxed(diff);
    assertEqual(hunks.length, 1, '解析简化 header (@@ ... @@)');
}

{
    const diff = `
@@ -1,3 +1,3 @@
 line1
-old1
+new1

@@ -10,3 +10,3 @@
 line10
-old2
+new2
`;
    const hunks = parseUnifiedDiffRelaxed(diff);
    assertEqual(hunks.length, 2, '解析多个 hunk');
}

// ---------- 测试 3: 内容匹配 ----------
testSection('内容匹配算法');

{
    const fileLines = ['line 1', 'function foo() {', '  return 1;', '}', 'line 5'];
    const searchLines = ['function foo() {', '  return 1;', '}'];
    const matches = findBlockInLines(fileLines, searchLines);

    assertEqual(matches.length, 1, '精确匹配');
    assertEqual(matches[0].startIdx, 1, '位置正确');
    assertEqual(matches[0].matchType, 'exact', '类型为 exact');
}

{
    const fileLines = ['function foo() {', '    return 1;', '}'];
    const searchLines = ['function foo() {', '  return 1;', '}'];
    const matches = findBlockInLines(fileLines, searchLines);

    assert(matches.length >= 1, '标准化匹配（空白差异）');
}

{
    const fileLines = ['a', 'b', 'c'];
    const searchLines = ['x', 'y', 'z'];
    const matches = findBlockInLines(fileLines, searchLines);

    assertEqual(matches.length, 0, '无匹配返回空');
}

// ---------- 测试 4: 重复代码检测 ----------
testSection('重复代码检测');

{
    const fileLines = [
        'function foo() {',
        '  return 1;',
        '}',
        '',
        'function bar() {',
        '  return 1;',
        '}'
    ];
    const searchLines = ['  return 1;'];
    const result = findUniqueMatch(fileLines, searchLines);

    assert(result.error !== undefined, '多匹配应报错');
}

{
    const fileLines = [
        'function foo() {',
        '  return 1;',
        '}',
        '',
        'function bar() {',
        '  return 1;',
        '}'
    ];
    const searchLines = ['function foo() {', '  return 1;', '}'];
    const result = findUniqueMatch(fileLines, searchLines);

    assert(result.match !== null, '增加上下文后唯一匹配');
    assertEqual(result.match.startIdx, 0, '位置正确');
}

// ---------- 测试 5: withinRange ----------
testSection('withinRange 范围限定');

{
    const fileLines = [
        '// Section 1',
        'function foo() {',
        '  return 1;',
        '}',
        '',
        '// Section 2',
        'function foo() {',
        '  return 2;',
        '}'
    ];

    const searchLines = ['function foo() {'];

    const allMatches = findBlockInLines(fileLines, searchLines);
    assert(allMatches.length >= 2, '不限定范围有多个匹配');

    const rangeMatches1 = findBlockInLines(fileLines, searchLines, { startLine: 1, endLine: 5 });
    assertEqual(rangeMatches1.length, 1, '限定前半部分');

    const rangeMatches2 = findBlockInLines(fileLines, searchLines, { startLine: 6, endLine: 9 });
    assertEqual(rangeMatches2.length, 1, '限定后半部分');
}

// ---------- 测试 6: 相似度计算 ----------
testSection('相似度计算');

{
    assertEqual(similarity('hello', 'hello'), 1, '相同字符串');
    assert(similarity('hello world', 'hello worlds') > 0.9, '相似字符串');
    assert(similarity('abc', 'xyz') < 0.5, '不同字符串');
}

// ---------- 测试 7: 边界情况 ----------
testSection('边界情况');

{
    assertEqual(findBlockInLines([], ['any']).length, 0, '空文件');
    assertEqual(findBlockInLines(['single'], ['single']).length, 1, '单行文件');
    assertEqual(findBlockInLines(['a', 'b'], ['a', 'b', 'c', 'd']).length, 0, '搜索比文件长');
}

{
    const fileLines = ['a', 'b', 'target'];
    const matches = findBlockInLines(fileLines, ['target']);
    assertEqual(matches.length, 1, '文件末尾匹配');
    assertEqual(matches[0].startIdx, 2, '末尾位置正确');
}

{
    const fileLines = ['function foo() {', '', '  return 1;', '}'];
    const searchLines = ['function foo() {', '', '  return 1;', '}'];
    assertEqual(findBlockInLines(fileLines, searchLines).length, 1, '包含空行');
}

// ---------- 测试 8: 复杂场景 ----------
testSection('复杂真实场景');

{
    const fileLines = `import React from 'react';

interface Props {
  name: string;
}

export const Greeting: React.FC<Props> = ({ name }) => {
  return (
    <div>
      <h1>Hello, {name}!</h1>
    </div>
  );
};

export default Greeting;`.split('\n');

    const searchLines = `export const Greeting: React.FC<Props> = ({ name }) => {
  return (
    <div>
      <h1>Hello, {name}!</h1>
    </div>
  );
};`.split('\n');

    const matches = findBlockInLines(fileLines, searchLines);
    assert(matches.length >= 1, 'React 组件至少找到一个匹配');
    // 使用 findUniqueMatch 测试
    const result = findUniqueMatch(fileLines, searchLines);
    assert(result.match !== null, 'React 组件唯一匹配');
}

{
    const fileLines = `class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}`.split('\n');

    const searchLines = `  subtract(a: number, b: number): number {
    return a - b;
  }`.split('\n');

    const result = findUniqueMatch(fileLines, searchLines);
    assert(result.match !== null, '类方法匹配');
    assertEqual(result.match.startIdx, 5, '类方法位置正确');
}

// ---------- 测试 9: Diff 高级场景 ----------
testSection('Diff 高级场景');

{
    const diff = `
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`;
    const hunks = parseUnifiedDiffRelaxed(diff);
    assertEqual(hunks[0].oldContent.length, 0, '纯新增无旧内容');
    assertEqual(hunks[0].newContent.length, 3, '纯新增有新内容');
}

{
    const diff = `
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3
`;
    const hunks = parseUnifiedDiffRelaxed(diff);
    assertEqual(hunks[0].oldContent.length, 3, '纯删除有旧内容');
    assertEqual(hunks[0].newContent.length, 0, '纯删除无新内容');
}

// ---------- 测试 10: 集成测试 ----------
testSection('集成测试 - 完整替换流程');

{
    let fileLines = `import React from 'react';

const App = () => {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
};

export default App;`.split('\n');

    const blocks = parseSearchReplaceBlocks(`
<<<<<<< SEARCH
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
=======
      <button onClick={() => setCount(count + 1)}>+</button>
      <button onClick={() => setCount(count - 1)}>-</button>
>>>>>>> REPLACE
`);

    assertEqual(blocks.length, 1, '集成测试: 解析块');

    const searchLines = blocks[0].search.split('\n');
    const result = findUniqueMatch(fileLines, searchLines);

    assert(result.match !== null, '集成测试: 找到匹配');

    if (result.match) {
        const replaceLines = blocks[0].replace.split('\n');
        fileLines.splice(result.match.startIdx, result.match.endIdx - result.match.startIdx, ...replaceLines);

        const newContent = fileLines.join('\n');
        assert(newContent.includes('<button onClick={() => setCount(count + 1)}>+</button>'), '集成测试: 替换成功');
        assert(newContent.includes('<button onClick={() => setCount(count - 1)}>-</button>'), '集成测试: 新内容正确');
    }
}

// ---------- 测试 11: 多块批量操作 ----------
testSection('多块批量操作');

{
    let fileLines = [
        'const a = 1;',
        'const b = 2;',
        'const c = 3;',
        '',
        'function sum() {',
        '  return a + b + c;',
        '}'
    ];

    const blocks = parseSearchReplaceBlocks(`
<<<<<<< SEARCH
const a = 1;
=======
const a = 10;
>>>>>>> REPLACE

<<<<<<< SEARCH
const c = 3;
=======
const c = 30;
>>>>>>> REPLACE
`);

    assertEqual(blocks.length, 2, '批量: 解析两个块');

    const operations = [];
    for (const block of blocks) {
        const searchLines = block.search.split('\n');
        const result = findUniqueMatch(fileLines, searchLines);
        if (result.match) {
            operations.push({ block, match: result.match });
        }
    }

    operations.sort((a, b) => b.match.startIdx - a.match.startIdx);

    for (const op of operations) {
        const replaceLines = op.block.replace.split('\n');
        fileLines.splice(op.match.startIdx, op.match.endIdx - op.match.startIdx, ...replaceLines);
    }

    const result = fileLines.join('\n');
    assert(result.includes('const a = 10;'), '批量: 第一处替换');
    assert(result.includes('const c = 30;'), '批量: 第二处替换');
    assert(result.includes('const b = 2;'), '批量: 未修改的保持不变');
}

// ---------- 测试 12: 模糊匹配容错 ----------
testSection('模糊匹配容错');

{
    const fileLines = [
        'if (condition) {',
        '    doSomething();',
        '}'
    ];

    const searchLines = [
        'if (condition) {',
        '  doSomething();',
        '}'
    ];

    const matches = findBlockInLines(fileLines, searchLines);
    assert(matches.length >= 1, '空白差异应能匹配');
}

// ============================================================
// 测试结果
// ============================================================

console.log('\n' + '='.repeat(50));
console.log(`测试完成: ${testsPassed} 通过, ${testsFailed} 失败`);
console.log('='.repeat(50));

if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('\n✓ 所有测试通过！');
}
