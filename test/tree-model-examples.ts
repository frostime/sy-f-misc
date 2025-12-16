/*
 * tree-model 使用示例
 */

import {
    ITreeDataSource,
    TreeNode,
    TreeBuilder,
    TreeFormatter
} from '../src/libs/tree-model';


interface FileData {
    name: string;
    type: 'file' | 'directory';
    size?: number;
    extension?: string;
}

class FileDataSource implements ITreeDataSource<FileData> {
    constructor(private file: FileData, private children?: FileData[]) { }

    getData(): FileData {
        return this.file;
    }

    getChildren(): ITreeDataSource<FileData>[] {
        if (this.file.type === 'directory' && this.children) {
            return this.children.map(child =>
                new FileDataSource(child, (child as any).children)
            );
        }
        return [];
    }
}

async function exampleFileSystem() {
    // 模拟文件系统数据
    const fileSystem: any = {
        name: 'project',
        type: 'directory',
        children: [
            {
                name: 'src',
                type: 'directory',
                children: [
                    { name: 'index.ts', type: 'file', size: 1024, extension: 'ts' },
                    { name: 'utils.ts', type: 'file', size: 512, extension: 'ts' },
                    {
                        name: 'components',
                        type: 'directory',
                        children: [
                            { name: 'Button.tsx', type: 'file', size: 2048, extension: 'tsx' },
                            { name: 'Input.tsx', type: 'file', size: 1536, extension: 'tsx' }
                        ]
                    }
                ]
            },
            { name: 'package.json', type: 'file', size: 256, extension: 'json' },
            { name: 'README.md', type: 'file', size: 1024, extension: 'md' }
        ]
    };

    // 构建文件树
    const tree = await TreeBuilder.build([new FileDataSource(fileSystem, fileSystem.children)], {
        transformer: (data) => data  // 保持原始数据
    });

    console.log('=== 文件系统树 ===\n');

    // 1. 格式化输出
    const lines = TreeFormatter.format(tree, {
        formatNode: (node) => {
            const icon = node.data.type === 'directory' ? '📁' : '📄';
            let content = `${icon} ${node.data.name}`;
            if (node.data.size) {
                content += ` (${node.data.size} bytes)`;
            }
            return content;
        }
    });
    console.log(lines.join('\n'));

    // 2. 查找所有 TypeScript 文件
    console.log('\n=== 所有 TypeScript 文件 ===\n');
    const tsFiles = tree.findAll(node =>
        node.data.extension === 'ts' || node.data.extension === 'tsx'
    );

    tsFiles.forEach(file => {
        const path = file.getPath().map(n => n.data.name).join('/');
        console.log(`${path} (${file.data.size} bytes)`);
    });

    // 3. 计算总大小
    console.log('\n=== 统计信息 ===\n');
    let totalSize = 0;
    tree.traverse(node => {
        if (node.data.size) {
            totalSize += node.data.size;
        }
    });
    console.log(`总文件大小: ${totalSize} bytes`);

    // 4. 按路径查找文件
    console.log('\n=== 按路径查找 ===\n');
    const buttonFile = tree.findByPath([
        (data: FileData) => data.name === 'project',
        (data: FileData) => data.name === 'src',
        (data: FileData) => data.name === 'components',
        (data: FileData) => data.name === 'Button.tsx'
    ]);

    if (buttonFile) {
        console.log('找到文件: Button.tsx');
        const fullPath = buttonFile.getPath().map(n => n.data.name).join('/');
        console.log(`完整路径: ${fullPath}`);
    }
}

// ============================================================
// 示例: 高级查询示例
// ============================================================

async function exampleAdvancedQuery() {
    // 使用文件系统示例的数据
    const fileSystem: any = {
        name: 'project',
        type: 'directory',
        children: [
            {
                name: 'src',
                type: 'directory',
                children: [
                    { name: 'index.ts', type: 'file', size: 1024 },
                    { name: 'utils.ts', type: 'file', size: 512 }
                ]
            }
        ]
    };

    const tree = await TreeBuilder.build([new FileDataSource(fileSystem, fileSystem.children)]);

    console.log('=== 高级查询示例 ===\n');

    // 1. 查找最大的文件
    let largestFile: TreeNode<FileData> | null = null;
    tree.traverse(node => {
        if (node.data.type === 'file' && node.data.size) {
            if (!largestFile || node.data.size > (largestFile.data.size || 0)) {
                largestFile = node;
            }
        }
    });

    if (largestFile !== null) {
        //@ts-ignore
        console.log(`最大文件: ${largestFile.data.name} (${largestFile.data.size} bytes)`);
    }

    // 2. 查找所有空目录
    const emptyDirs = tree.findAll(node =>
        node.data.type === 'directory' && node.children.length === 0
    );
    console.log(`\n空目录数量: ${emptyDirs.length}`);

    // 3. 查找深度为 2 的所有节点
    const depth2Nodes = tree.findAll(node => node.depth === 2);
    console.log(`\n深度为 2 的节点:`);
    depth2Nodes.forEach(node => {
        console.log(`  - ${node.data.name}`);
    });

    // 4. 获取某个节点的所有兄弟节点
    const indexFile = tree.find(node => node.data.name === 'index.ts');
    if (indexFile) {
        const siblings = indexFile.getSiblings();
        console.log(`\nindex.ts 的兄弟节点:`);
        siblings.forEach(sibling => {
            console.log(`  - ${sibling.data.name}`);
        });
    }
}

// 运行所有示例
async function runAllExamples() {
    await exampleFileSystem();
    await exampleAdvancedQuery();
}
