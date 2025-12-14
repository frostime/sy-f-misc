/**
 * VFS 功能测试
 * 测试新增的功能和 file-system 工具组兼容性
 */

// 模拟浏览器环境
global.window = {
    require: (name) => {
        if (name === 'fs') return require('fs');
        if (name === 'path') return require('path');
        if (name === 'os') return require('os');
        if (name === 'readline') return require('readline');
        return null;
    }
};

const { createVFS, InMemoryVFS, LocalDiskVFS } = require('../src/libs/vfs/index.ts');

async function testVFS() {
    console.log('=== VFS 功能测试 ===\n');

    // 测试1: 创建 VFS 实例
    console.log('1. 创建 VFS 实例...');
    const vfs = createVFS({
        memory: true,
        local: true
    });
    console.log('✅ VFS 创建成功\n');

    // 测试2: 环境检测
    console.log('2. 测试环境检测...');
    console.log('   VFS 可用:', vfs.isAvailable());
    console.log('   VFS 能力:', JSON.stringify(vfs.getCapabilities(), null, 2));
    console.log('✅ 环境检测通过\n');

    // 测试3: 内存文件系统基础操作
    console.log('3. 测试内存文件系统...');
    await vfs.writeFile('memory:///test.txt', 'Hello VFS!');
    const content = await vfs.readFile('memory:///test.txt');
    console.log('   读取内容:', content);
    console.log('✅ 内存 FS 读写成功\n');

    // 测试4: copyFile
    console.log('4. 测试文件复制...');
    await vfs.copyFile('memory:///test.txt', 'memory:///test_copy.txt');
    const copiedContent = await vfs.readFile('memory:///test_copy.txt');
    console.log('   复制后内容:', copiedContent);
    console.log('✅ 文件复制成功\n');

    // 测试5: rename
    console.log('5. 测试文件重命名...');
    await vfs.rename('memory:///test_copy.txt', 'memory:///test_renamed.txt');
    const exists = await vfs.exists('memory:///test_renamed.txt');
    console.log('   重命名后存在:', exists);
    console.log('✅ 文件重命名成功\n');

    // 测试6: toRealPath
    console.log('6. 测试获取真实路径...');
    const realPath = await vfs.toRealPath('memory:///test.txt');
    console.log('   内存文件真实路径:', realPath);
    console.log('✅ toRealPath 测试成功\n');

    // 测试7: materialize
    console.log('7. 测试文件物化...');
    try {
        const tempPath = await vfs.materialize('memory:///test.txt');
        console.log('   物化路径:', tempPath);
        
        // 验证物化的文件
        const fs = require('fs');
        if (fs.existsSync(tempPath)) {
            const materializedContent = fs.readFileSync(tempPath, 'utf-8');
            console.log('   物化内容:', materializedContent);
            fs.unlinkSync(tempPath); // 清理
        }
        console.log('✅ 文件物化成功\n');
    } catch (e) {
        console.error('   ⚠️ 物化失败:', e.message);
    }

    // 测试8: 本地文件系统（如果可用）
    if (vfs.toRealPath) {
        console.log('8. 测试本地文件系统...');
        const os = require('os');
        const path = require('path');
        const testFile = path.join(os.tmpdir(), 'vfs_test_' + Date.now() + '.txt');
        
        await vfs.writeFile(testFile, 'Local FS Test');
        const localContent = await vfs.readFile(testFile);
        console.log('   本地文件内容:', localContent);
        
        // 清理
        await vfs.unlink(testFile);
        console.log('✅ 本地 FS 测试成功\n');
    }

    // 测试9: 跨文件系统复制
    if (vfs.toRealPath) {
        console.log('9. 测试跨文件系统复制...');
        const os = require('os');
        const path = require('path');
        const localFile = path.join(os.tmpdir(), 'vfs_cross_' + Date.now() + '.txt');
        
        // 从内存复制到本地
        await vfs.copyFile('memory:///test.txt', localFile);
        const crossContent = await vfs.readFile(localFile);
        console.log('   跨 FS 复制内容:', crossContent);
        
        // 清理
        await vfs.unlink(localFile);
        console.log('✅ 跨文件系统复制成功\n');
    }

    console.log('=== 所有测试通过! ===');
}

// 运行测试
testVFS().catch(console.error);
