/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-12-23 17:31:26
 * @FilePath     : /src/func/gpt/persistence/json-files.ts
 * @LastEditTime : 2024-12-26 00:41:20
 * @Description  : 
 */
import { thisPlugin, api, matchIDFormat } from "@frostime/siyuan-plugin-kits";
import { adaptIMessageContent } from "@gpt/data-utils";

const rootName = 'chat-history';

// Snapshot 相关常量
const SNAPSHOT_FILE = 'history-snapshot.json';
const SNAPSHOT_VERSION = '1.0';
const PREVIEW_LENGTH = 500;

export const saveToJson = async (history: IChatSessionHistory) => {
    const plugin = thisPlugin();

    const filepath = `${rootName}/${history.id}.json`;
    await plugin.saveData(filepath, { ...history });
    
    // 同步更新snapshot
    await updateSessionInSnapshot(history);
}


export const tryRecoverFromJson = async (filePath: string) => {
    // const plugin = thisPlugin();
    const blob = await api.getFileBlob(filePath);
    // 空?
    if (!blob) {
        return null;
    }
    // 解析json
    try {
        //application json
        let text = await blob.text();
        return JSON.parse(text);
    } catch (e) {
        console.warn(`Failed to parse json file: ${filePath}`, e);
        return null;
    }
}


export const listFromJson = async (): Promise<IChatSessionHistory[]> => {
    let snapshot = await readSnapshot();
    
    // 检查是否需要重建snapshot
    if (!snapshot || snapshot.version !== SNAPSHOT_VERSION) {
        snapshot = await rebuildSnapshot();
    }
    
    // 将snapshot数据转换为IChatSessionHistory格式（仅包含基本信息）
    return snapshot.sessions.map(session => ({
        id: session.id,
        title: session.title,
        timestamp: session.timestamp,
        updated: session.updated,
        tags: session.tags,
        items: [], // 不加载完整消息，需要时再加载
        sysPrompt: session.systemPrompt || '', // 不加载系统提示
        // 添加一些额外的预览信息
        _preview: session.preview,
        _messageCount: session.messageCount,
        _lastMessageAuthor: session.lastMessageAuthor
    } as IChatSessionHistory & { _preview?: string; _messageCount?: number; _lastMessageAuthor?: string }));
};

export const getFromJson = async (id: string): Promise<IChatSessionHistory> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const filepath = `${dir}${id}.json`;
    const content = await tryRecoverFromJson(filepath);
    return content as IChatSessionHistory;
}


export const removeFromJson = async (id: string) => {
    const plugin = thisPlugin();
    const filepath = `${rootName}/${id}.json`;
    await plugin.removeData(filepath);
    
    // 同步更新snapshot
    await removeSessionFromSnapshot(id);
}

/**
 * 生成单个会话的快照数据
 */
const generateSessionSnapshot = (history: IChatSessionHistory): IChatSessionSnapshot => {
    // 过滤出真正的消息项
    const messageItems = history.items.filter(item => 
        item.type === 'message' && item.message?.content
    );
    
    // 提取预览内容
    const previewParts: string[] = [];
    let totalLength = 0;
    
    for (const item of messageItems.slice(0, 3)) { // 只取前3条消息
        const { text } = adaptIMessageContent(item.message.content);
        const authorPrefix = `${item.author || 'unknown'}: `;
        const contentToAdd = authorPrefix + text.replace(/\n/g, ' ').trim();
        
        if (totalLength + contentToAdd.length > PREVIEW_LENGTH) {
            const remainingLength = PREVIEW_LENGTH - totalLength;
            if (remainingLength > authorPrefix.length) {
                previewParts.push(contentToAdd.substring(0, remainingLength) + '...');
            }
            break;
        }
        
        previewParts.push(contentToAdd);
        totalLength += contentToAdd.length;
    }
    
    // 获取最后一条消息信息
    const lastMessage = messageItems[messageItems.length - 1];
    
    return {
        id: history.id,
        title: history.title,
        timestamp: history.timestamp,
        updated: history.updated,
        tags: history.tags,
        preview: previewParts.join('\n'),
        messageCount: messageItems.length,
        lastMessageAuthor: lastMessage?.author || 'unknown',
        lastMessageTime: lastMessage?.timestamp || history.timestamp,
        systemPrompt: history.sysPrompt // 保存系统提示以供搜索
    };
};

/**
 * 读取snapshot文件
 */
const readSnapshot = async (): Promise<IHistorySnapshot | null> => {
    try {
        const dir = `data/storage/petal/${thisPlugin().name}/`;
        const content = await tryRecoverFromJson(`${dir}${SNAPSHOT_FILE}`);
        return content as IHistorySnapshot;
    } catch (e) {
        console.warn('Failed to read snapshot file:', e);
        return null;
    }
};

/**
 * 写入snapshot文件
 */
const writeSnapshot = async (snapshot: IHistorySnapshot) => {
    const plugin = thisPlugin();
    await plugin.saveData(SNAPSHOT_FILE, snapshot);
};

/**
 * 从现有JSON文件重建snapshot
 */
const rebuildSnapshot = async (): Promise<IHistorySnapshot> => {
    console.log('Rebuilding history snapshot...');
    const histories = await listFromJsonLegacy();
    
    const sessions = histories.map(generateSessionSnapshot);
    
    const snapshot: IHistorySnapshot = {
        version: SNAPSHOT_VERSION,
        lastUpdated: Date.now(),
        sessions: sessions.sort((a, b) => {
            const aTime = a.updated || a.timestamp;
            const bTime = b.updated || b.timestamp;
            return bTime - aTime;
        })
    };
    
    await writeSnapshot(snapshot);
    return snapshot;
};

/**
 * 更新snapshot中的单个会话
 */
const updateSessionInSnapshot = async (history: IChatSessionHistory) => {
    let snapshot = await readSnapshot();
    
    if (!snapshot) {
        // 如果snapshot不存在，重建它
        snapshot = await rebuildSnapshot();
        return;
    }
    
    const sessionSnapshot = generateSessionSnapshot(history);
    const existingIndex = snapshot.sessions.findIndex(s => s.id === history.id);
    
    if (existingIndex >= 0) {
        snapshot.sessions[existingIndex] = sessionSnapshot;
    } else {
        snapshot.sessions.unshift(sessionSnapshot); // 新会话添加到开头
    }
    
    // 重新排序
    snapshot.sessions.sort((a, b) => {
        const aTime = a.updated || a.timestamp;
        const bTime = b.updated || b.timestamp;
        return bTime - aTime;
    });
    
    snapshot.lastUpdated = Date.now();
    await writeSnapshot(snapshot);
};

/**
 * 从snapshot中删除会话
 */
const removeSessionFromSnapshot = async (sessionId: string) => {
    const snapshot = await readSnapshot();
    if (!snapshot) return;
    
    snapshot.sessions = snapshot.sessions.filter(s => s.id !== sessionId);
    snapshot.lastUpdated = Date.now();
    await writeSnapshot(snapshot);
};

/**
 * 重命名原来的函数为legacy版本
 */
const listFromJsonLegacy = async (): Promise<IChatSessionHistory[]> => {
    const dir = `data/storage/petal/${thisPlugin().name}/${rootName}/`;
    const files = await api.readDir(dir);
    if (!files) return [];

    let filename = files.filter(f => !f.isDir).map(f => f.name).filter(f => f.endsWith('.json'));
    filename = filename.filter((f) => {
        const name = f.split('.').slice(0, -1);
        if (matchIDFormat(name[0])) return true;
        return false;
    })

    let promises = filename.map(async f => {
        const content = await tryRecoverFromJson(`${dir}${f}`);
        if (!content) return null;
        return content
    });
    let storages: any[] = await Promise.all(promises);
    return storages.filter(s => s) as IChatSessionHistory[];
};

/**
 * 手动重建snapshot的公共函数
 */
export const rebuildHistorySnapshot = async () => {
    return await rebuildSnapshot();
};
