/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2025-04-06 14:42:36
 * @FilePath     : /src/func/gpt/components/TitleTagEditor.tsx
 * @Description  : Title and Tag Editor Component
 */
import { Component, createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { on } from "solid-js";
import Form from "@/libs/components/Form";
import * as persist from "../persistence";



let allTags: Set<string>;

const addTags = (tags: string[] | string) => {
    if (!allTags) {
        allTags = new Set();
    }
    if (Array.isArray(tags)) {
        allTags = allTags.union(new Set(tags));
    } else {
        allTags.add(tags);
    }
}

const setAllTags = (tags: string[]) => {
    if (!allTags) {
        allTags = new Set();
    } else {
        allTags.clear();
    }
    allTags = allTags.union(new Set(tags));
}


const loadTagsFromStorage = async () => {
    try {
        // 从本地存储获取历史记录
        const localHistories = await persist.listFromLocalStorage();
        // 从 JSON 文件获取历史记录
        const jsonHistories = await persist.listFromJson();

        // 合并所有历史记录
        const allHistories = [...localHistories, ...jsonHistories];

        // 收集所有标签
        const tagSet = new Set<string>();
        allHistories.forEach(item => {
            if (item.tags && item.tags.length > 0) {
                item.tags.forEach(tag => tagSet.add(tag));
            }
        });

        addTags(Array.from(tagSet));
    } catch (error) {
        console.error('加载标签失败:', error);
    }
}


const TitleTagEditor: Component<{
    title: string;
    tags: string[];
    onSave: (title: string, tags: string[]) => void;
    onClose: () => void;
}> = (props) => {
    // 使用 SolidJS 的状态管理
    const [title, setTitle] = createSignal(props.title);
    const [tags, setTags] = createSignal([...props.tags]);
    const [newTag, setNewTag] = createSignal('');
    const [existingTagsList, setExistingTagsList] = createSignal<string[]>([]);

    // 获取所有现有标签
    const loadExistingTags = async () => {
        if (allTags === undefined) {
            await loadTagsFromStorage();
        }
        // 过滤掉当前已添加的标签并排序
        const filteredTags = Array.from(allTags)
            .filter(tag => !tags().includes(tag))
            .sort();
        setExistingTagsList(filteredTags);
    };

    // 组件挂载时加载标签
    onMount(() => {
        loadExistingTags();
    });

    onCleanup(() => {
        addTags(tags());
    });

    // 当当前标签列表变化时，更新可选标签列表
    createEffect(on(tags, () => {
        // 当删除标签时，需要重新加载所有可用标签
        if (existingTagsList().length === 0) {
            loadExistingTags();
        } else {
            // 仅过滤现有列表
            setExistingTagsList(prev =>
                prev.filter(tag => !tags().includes(tag))
            );
        }
    }));

    // 添加标签
    const addTag = () => {
        const tagToAdd = newTag().trim();
        if (tagToAdd && !tags().includes(tagToAdd)) {
            setTags([...tags(), tagToAdd]);
            setNewTag('');
        }
    };

    // 从下拉菜单选择标签
    const selectTag = (tag: string) => {
        if (!tags().includes(tag)) {
            setTags([...tags(), tag]);
        }
    };

    // 删除标签
    const removeTag = (tag: string) => {
        setTags(tags().filter(t => t !== tag));
        // 确保被删除的标签重新出现在下拉列表中
        if (!existingTagsList().includes(tag)) {
            setExistingTagsList([...existingTagsList(), tag].sort());
        }
    };

    // 保存更改
    const saveChanges = () => {
        props.onSave(title(), tags());
    };

    return (
        <div style="padding: 16px; gap: 16px; width: 100%; height: 100%;">
            <Form.Wrap
                title='标题'
                description=''
            >
                <input
                    type="text"
                    class="b3-text-field"
                    style={{
                        flex: 1
                    }}
                    value={title()}
                    onInput={(e) => setTitle(e.currentTarget.value)}
                />
            </Form.Wrap>

            <Form.Wrap
                title='标签'
                description=''
                direction='row'
            >
                <div class="fn__flex" style="gap: 8px;">
                    <input
                        type="text"
                        class="b3-text-field fn__flex-1"
                        value={newTag()}
                        onInput={(e) => setNewTag(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        placeholder="输入标签名称并按回车添加"
                    />
                    <button
                        class="b3-button b3-button--outline"
                        onClick={addTag}
                        disabled={!newTag().trim()}
                    >
                        添加
                    </button>
                </div>

                {/* 现有标签选择框 */}
                <Show when={existingTagsList().length > 0}>
                    <div class="fn__flex" style="gap: 8px; margin-top: 8px;">
                        <select
                            class="b3-select fn__flex-1"
                            onChange={(e) => {
                                if (e.currentTarget.value) {
                                    selectTag(e.currentTarget.value);
                                    e.currentTarget.value = ''; // 重置选择框
                                }
                            }}
                        >
                            <option value="">选择已有标签...</option>
                            <For each={existingTagsList()}>
                                {(tag) => (
                                    <option value={tag}>{tag}</option>
                                )}
                            </For>
                        </select>
                    </div>
                </Show>

                {/* 标签展示区 */}
                <div class="fn__flex fn__flex-wrap" style="gap: 8px; min-height: 32px; margin-top: 8px;">
                    <Show when={tags().length > 0} fallback={
                        <div style="color: var(--b3-theme-on-surface-light); font-style: italic;">
                            暂无标签，请添加
                        </div>
                    }>
                        <For each={tags()}>
                            {(tag) => (
                                <div class="fn__flex fn__flex-center" style="
                                    background-color: var(--b3-theme-primary-lightest);
                                    color: var(--b3-theme-primary-dark);
                                    border-radius: 16px;
                                    padding: 4px 12px;
                                    gap: 6px;
                                ">
                                    <span>{tag}</span>
                                    <span
                                        onClick={() => removeTag(tag)}
                                        style="cursor: pointer; display: flex; align-items: center;"
                                    >
                                        <svg style="width: 14px; height: 14px;"><use href="#iconClose"></use></svg>
                                    </span>
                                </div>
                            )}
                        </For>
                    </Show>
                </div>
            </Form.Wrap>

            {/* 按钮区 */}
            <div class="fn__flex" style="justify-content: flex-end; gap: 8px; margin-top: 8px;">
                <button class="b3-button b3-button--cancel" onClick={props.onClose}>取消</button>
                <button class="b3-button b3-button--text" onClick={saveChanges}>保存</button>
            </div>
        </div>
    );
};

export default TitleTagEditor;
