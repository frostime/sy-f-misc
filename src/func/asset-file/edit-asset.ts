import { Menu, showMessage } from 'siyuan';
import { simpleDialog } from '@frostime/siyuan-plugin-kits';
import { siyuanVfs } from '@/libs/vfs/vfs-siyuan-adapter';

const TEXT_ASSET_EXTENSIONS = new Set([
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonc', 'xml', 'svg',
    'html', 'htm', 'css', 'scss', 'less', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx',
    'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'log', 'sql', 'sh', 'py',
]);

export const addEditAssetMenu = (menu: Menu, src: string) => {
    let route: string;
    try {
        route = decodeURIComponent(src.split(/[?#]/)[0]).replace(/^\//, '');
    } catch {
        return;
    }
    const parts = route.split('/');
    if (parts[0] !== 'assets' || parts.some(part => !part || part === '.' || part === '..')
        || route.includes('\\')) {
        return;
    }
    const filename = parts[parts.length - 1];
    const ext = filename.split('.').pop()?.toLowerCase();
    if (!TEXT_ASSET_EXTENSIONS.has(ext)) return;

    menu.addItem({
        label: 'Edit Asset File',
        icon: 'iconEdit',
        click: () => {
            setTimeout(() => { void openAssetEditor(`/data/${route}`, filename); });
        }
    });
};

const openAssetEditor = async (path: string, filename: string) => {
    let content: string;
    try {
        const result = await siyuanVfs.readFile(path, 'blob');
        if (!result.ok) throw new Error('读取资源文件失败');
        // 拒绝非 UTF-8 内容，避免把不支持的编码或二进制文件保存成乱码。
        content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
            .decode(await (result.data as Blob).arrayBuffer());
    } catch (error) {
        console.error('读取文本资源失败:', error);
        showMessage('无法读取资源文件，或文件不是 UTF-8 文本', 5000, 'error');
        return;
    }

    const body = document.createElement('div');
    body.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:16px;width:100%;height:100%;box-sizing:border-box;';
    const fileLabel = document.createElement('div');
    fileLabel.textContent = path;
    fileLabel.style.cssText = 'overflow-wrap:anywhere;color:var(--b3-theme-on-surface);';
    const textarea = document.createElement('textarea');
    textarea.className = 'b3-text-field fn__block';
    textarea.style.cssText = 'flex:1;min-height:0;resize:none;font-family:var(--b3-font-family-code);';
    textarea.spellcheck = false;
    // 文件内容只能作为文本赋值，不能插入对话框 HTML。
    textarea.value = content;
    textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter') event.stopPropagation();
    });

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const cancel = document.createElement('button');
    cancel.className = 'b3-button b3-button--cancel';
    cancel.textContent = '取消';
    const save = document.createElement('button');
    save.className = 'b3-button';
    save.textContent = '保存（覆盖原文件）';
    actions.append(cancel, save);
    body.append(fileLabel, textarea, actions);
    const dialog = simpleDialog({
        title: 'Edit Asset File',
        ele: body,
        width: '900px',
        height: '650px',
        maxWidth: '90vw',
        maxHeight: '90vh'
    });
    textarea.setAttribute('aria-label', filename);
    cancel.onclick = () => dialog.close();
    save.onclick = async () => {
        save.disabled = true;
        cancel.disabled = true;
        try {
            const result = await siyuanVfs.writeFile(path, textarea.value);
            if (!result.ok) throw new Error(result.error);
            showMessage('资源文件已保存', 2000, 'info');
            dialog.close();
        } catch (error) {
            console.error('保存文本资源失败:', error);
            showMessage('保存失败，编辑内容已保留，请重试', 5000, 'error');
        } finally {
            save.disabled = false;
            cancel.disabled = false;
        }
    };
    textarea.focus();
};
