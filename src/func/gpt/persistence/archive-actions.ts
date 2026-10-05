import { confirmDialog, thisPlugin } from '@frostime/siyuan-plugin-kits';
import { showMessage } from 'siyuan';
import { getPermanentHistoryState, saveToJson } from './json-files';
import { serializeHistory } from './history-equality';

const counts = (history: IChatSessionHistoryV2) => {
    const nodes = Object.values(history.nodes);
    return `${nodes.length} 条记录，${nodes.reduce((sum, node) => sum + Object.keys(node.versions).length, 0)} 个版本`;
};

/** Archive the captured working snapshot only after explicit consent. Export and
 * clipboard actions do not enter this path. A failed read is never “not archived”. */
export const archiveWorkingHistory = async (working: IChatSessionHistoryV2): Promise<boolean> => {
    try {
        const history = structuredClone(working);
        const stored = await getPermanentHistoryState(history.id);
        if (stored.status === 'failed') throw new Error('无法核查永久存档，已取消保存，请稍后重试');
        const overwriting = stored.status === 'exists';
        const content = document.createElement('div');
        const paragraph = (text: string) => {
            const node = document.createElement('p'); node.textContent = text; content.append(node);
        };
        paragraph(`对话：${history.title}`);
        paragraph(overwriting ? '将用本次操作开始时的完整工作版，整体替换同 ID 的永久存档。不是另存副本，也不只是追加消息。' : '将为本次操作开始时的完整工作版建立永久存档，独立于临时缓存。');
        paragraph(`目标文件：${stored.path}`);
        if (stored.status === 'exists') {
            paragraph(`原永久存档：${counts(stored.history)}`);
            if ((history.updated ?? history.timestamp) < (stored.history.updated ?? stored.history.timestamp)) {
                paragraph('警告：工作版的更新时间早于永久存档；覆盖可能丢失已存档的新内容。');
            }
        }
        paragraph(`当前工作版：${counts(history)}（数量相同不代表内容相同）`);
        const confirmed = await new Promise<boolean>(resolve => {
            const { dialog } = confirmDialog({
                title: overwriting ? '更新永久存档？' : '建立永久存档？', content,
                width: '680px', maxWidth: '92vw', maxHeight: '85vh',
                confirm: () => resolve(true), cancel: () => resolve(false), destroyCallback: () => resolve(false),
            });
            const button = dialog.element.querySelector('#confirmDialogConfirmBtn');
            if (button) button.textContent = overwriting ? '覆盖永久存档' : '建立永久存档';
        });
        if (!confirmed) return false;
        const latest = await getPermanentHistoryState(history.id);
        if (latest.status === 'failed' || latest.status !== stored.status ||
            (latest.status === 'exists' && stored.status === 'exists' && serializeHistory(latest.history) !== serializeHistory(stored.history))) {
            throw new Error('永久存档在确认期间发生变化或无法核查，未覆盖；请重新打开归档确认');
        }
        const saved = await saveToJson(history, true, { overwriteConfirmed: true, createOnly: !overwriting });
        if (!saved) return false;
        showMessage(overwriting ? '永久存档已更新' : '已建立永久存档');
        return true;
    } catch (error) {
        showMessage(`归档未完成：${(error as Error).message || error}`, 7000, 'error');
        return false;
    }
};

/** The link targets the mutable permanent archive, not a fixed revision or the
 * current cache. Creating an archive is never a side effect of copying a link. */
export const copyArchiveLink = async (working: IChatSessionHistoryV2): Promise<boolean> => {
    try {
        const stored = await getPermanentHistoryState(working.id);
        if (stored.status === 'failed') throw new Error('无法读取永久存档，未复制链接');
        if (stored.status === 'missing') {
            showMessage('尚未建立永久存档，请先归档；复制链接不会自动保存');
            return false;
        }
        const query = new URLSearchParams({ historyId: working.id, historyTitle: stored.history.title });
        const url = `siyuan://plugins/${thisPlugin().name}/chat-session-history?${query}`;
        const title = stored.history.title.replace(/[\\\[\]]/g, '\\$&').replace(/[\r\n]/g, ' ');
        await navigator.clipboard.writeText(`[${title}](${url})`);
        showMessage('已复制永久存档链接；未归档的工作版更改不包含在内，后续更新存档会更新链接内容');
        return true;
    } catch (error) {
        showMessage((error as Error).message || String(error), 7000, 'error');
        return false;
    }
};
