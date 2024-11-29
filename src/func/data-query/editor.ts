// import { getBlockByID } from "@/api";
import { showMessage } from "siyuan";
import { inject } from "simple-inject";
import type FMiscPlugin from "@/index";

const child_process = require("child_process");

declare global {
    interface Window {
        monaco: any;
    }
}

const editJsCode = async (blockId: BlockId, element: HTMLDivElement) => {
    // const block = await getBlockByID(blockId);

    let code = element.dataset.content;
    code = window.Lute.UnEscapeHTMLStr(code);

    //桌面环境, 可以访问 node 环境
    if (child_process) {
        const os = require('os');
        const path = require('path');
        const fs = require('fs');
        const ext = code.startsWith('//!js') ? 'js' : 'sql';
        const filePath = path.join(os.tmpdir(), `siyuan-${blockId}-${Date.now()}.${ext}`);

        // 写入文件
        fs.writeFileSync(filePath, code);
        let editor: any;
        let watcher: any;
        const cleanUp = () => {
            watcher?.close();
            try {
                fs.unlinkSync(filePath); // 删除临时文件
            } catch (e) {
                console.error('清理临时文件失败:', e);
            }
        }

        const plugin = inject<FMiscPlugin>('plugin');
        const codeEditor = plugin.getConfig('Misc', 'codeEditor');
        //codeEditor 为一个命令行, 其中 {{filepath}} 会被替换为真实的文件路径
        const command = codeEditor.replace('{{filepath}}', filePath);
        const commandArr = command.split(' ').map(item => item.trim()).filter(item => item !== '');

        try {
            editor = child_process.spawn(commandArr[0], commandArr.slice(1));
        } catch (e) {
            console.error('启动代码编辑器失败:', e);
            cleanUp();
            return;
        }

        editor.on('exit', () => {
            console.log('代码编辑器已关闭');
            try {
                const updatedContent = fs.readFileSync(filePath, 'utf-8');
                // 更新块内容的逻辑
                element.dataset.content = window.Lute.EscapeHTMLStr(updatedContent);
            } catch (e) {
                console.error('读取文件失败:', e);
            }
            cleanUp();
            const btn: HTMLElement = element.querySelector('span.protyle-action__reload') as HTMLElement;
            btn?.click();
        });

        // 监听文件变化
        watcher = fs.watch(filePath, (eventType, filename) => {
            if (eventType === 'change') {
                try {
                    const updatedContent = fs.readFileSync(filePath, 'utf-8');
                    // 更新块内容的逻辑
                    element.dataset.content = window.Lute.EscapeHTMLStr(updatedContent);
                } catch (e) {
                    console.error('读取文件失败:', e);
                }
            }
        });
    } else {
        showMessage('当前环境不支持代码编辑器');
    }
}

export async function embedBlockEvent({ detail }: any) {
    if (detail.blockElements.length > 1) {
        return;
    }
    let ele: HTMLDivElement = detail.blockElements[0];
    let type = ele.getAttribute("data-type");
    if (type !== "NodeBlockQueryEmbed") {
        return;
    }

    let id = ele.getAttribute("data-node-id");
    let menu = detail.menu;
    menu.addItem({
        icon: "iconGit",
        label: "Edit Code",
        click: () => {
            editJsCode(id, ele);
        }
    });
}
