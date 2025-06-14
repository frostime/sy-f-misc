// h:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\setting\PromptTemplateSetting.tsx
import { Accessor, Component, For, createSignal, createMemo } from "solid-js";
import Form from "@/libs/components/Form";
import { globalMiscConfigs, promptTemplates } from "./store";
import Heading from "./Heading";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import { SvgSymbol } from "../chat/Elements";
import styles from "./SettingListStyles.module.scss";

const { SimpleProvider, useSimpleContext } = createSimpleContext<{
    updateTemplate: (index: number, key: keyof IPromptTemplate, value: any) => void;
    removeTemplate: (target: number | string) => void;
}>();


const PromptTemplateEditForm: Component<{
    index: Accessor<number>;
}> = (props) => {
    const { updateTemplate } = useSimpleContext();

    const template = () => promptTemplates()[props.index()];
    const index = () => props.index();

    return (
        <div style={{
            // "border": "2px dashed var(--b3-theme-secondary)",
            // "border-radius": "4px",
            "margin": "16px",
            "position": "relative",
            flex: 1,
            width: '100%',
            "box-sizing": "border-box"
        }}>
            <Form.Wrap
                title="模板名称"
                description="用于识别模板的名称"
            >
                <Form.Input
                    type="textinput"
                    value={template().name}
                    changed={(v) => updateTemplate(index(), 'name', v)}
                />
            </Form.Wrap>

            <Form.Wrap
                title="提示词类型"
                description="系统提示词或用户提示词"
            >
                <Form.Input
                    type="select"
                    value={template().type}
                    changed={(v) => updateTemplate(index(), 'type', v)}
                    options={{
                        'system': '系统提示词',
                        'user': '用户提示词'
                    }}
                />
            </Form.Wrap>

            <Form.Wrap
                title="提示词内容"
                description="完整的提示词内容"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={template().content}
                    changed={(v) => updateTemplate(index(), 'content', v)}
                    style={{
                        height: '250px',
                        width: '100%',
                        'font-size': '1.2em',
                        'line-height': '1.3em',
                        'white-space': 'pre-wrap'
                    }}
                />
            </Form.Wrap>
        </div>
    );
};


const PromptTemplateListItem = (props: {
    index: Accessor<number>;
    dragHandle: (e: DragEvent, index: number) => void;
}) => {

    const { updateTemplate, removeTemplate } = useSimpleContext();

    const onEdit = () => {
        solidDialog({
            title: '编辑 Prompt Template',
            loader: () => (
                <SimpleProvider state={{ updateTemplate, removeTemplate }}>
                    <PromptTemplateEditForm index={props.index} />
                </SimpleProvider>
            ),
            width: '750px',
            height: '600px'
        })
    }

    const onDelete = () => {
        removeTemplate(props.index());
    }
    return (
        <div
            draggable={true}
            onDragStart={(e: DragEvent) => props.dragHandle(e, props.index())}
            class={styles.listItem}
        >
            <span class={styles.listItemTitle}>
                {promptTemplates()[props.index()].name}
            </span>
            <span class="counter">
                {promptTemplates()[props.index()].type}
            </span>
            <button class="b3-button b3-button--text" onclick={() => {
                // 将当前项移动到同类型组的顶部
                const currentIndex = props.index();
                const currentType = promptTemplates()[currentIndex].type;

                promptTemplates.update(prev => {
                    const items = [...prev];
                    const [item] = items.splice(currentIndex, 1);

                    // 找到同类型的第一个项的索引
                    const firstSameTypeIndex = items.findIndex(p => p.type === currentType);

                    // 如果找到了同类型的项，插入到它前面；否则插入到数组开头
                    if (firstSameTypeIndex !== -1) {
                        items.splice(firstSameTypeIndex, 0, item);
                    } else {
                        items.unshift(item);
                    }

                    return items;
                });
            }}>
                <SvgSymbol size="15px">iconUp</SvgSymbol>
            </button>
            <button class="b3-button b3-button--text" onclick={() => {
                // 将当前项移动到同类型组的底部
                const currentIndex = props.index();
                const currentType = promptTemplates()[currentIndex].type;

                promptTemplates.update(prev => {
                    const items = [...prev];
                    const [item] = items.splice(currentIndex, 1);

                    // 找到同类型的最后一个项的索引
                    const lastSameTypeIndex = [...items].reverse().findIndex(p => p.type === currentType);

                    // 如果找到了同类型的项，插入到它后面；否则插入到数组末尾
                    if (lastSameTypeIndex !== -1) {
                        const actualIndex = items.length - 1 - lastSameTypeIndex;
                        items.splice(actualIndex + 1, 0, item);
                    } else {
                        items.push(item);
                    }

                    return items;
                });
            }}>
                <SvgSymbol size="15px">iconDown</SvgSymbol>
            </button>
            <button class="b3-button b3-button--text" onclick={() => onEdit()}>
                <SvgSymbol size="15px">iconEdit</SvgSymbol>
            </button>
            <button class="b3-button b3-button--text" onclick={() => onDelete()}>
                <SvgSymbol size="15px">iconTrashcan</SvgSymbol>
            </button>
        </div>
    )
}


const useDndReorder = () => {
    const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);
    const [targetIndex, setTargetIndex] = createSignal<number | null>(null);

    const handleDragStart = (e: DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', String(index));
    };

    const handleDragOver = (e: DragEvent, index: number) => {
        e.preventDefault();
        setTargetIndex(index);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        const _draggedIndex = draggedIndex();
        const _targetIndex = targetIndex();
        if (_draggedIndex !== null && _targetIndex !== null && _draggedIndex !== _targetIndex) {
            // 确保只在同类型提示词之间拖拽
            const draggedType = promptTemplates()[_draggedIndex].type;
            const targetType = promptTemplates()[_targetIndex].type;

            if (draggedType === targetType) {
                promptTemplates.update(prev => {
                    const items = [...prev];
                    // 将 draggedIndex 移动到 targetIndex 的位置，其余的保持不变
                    const draggedItem = items[_draggedIndex];
                    items.splice(_draggedIndex, 1);
                    items.splice(_targetIndex, 0, draggedItem);
                    return items;
                });
            }
        }
        setDraggedIndex(null);
        setTargetIndex(null);
    };


    return { handleDragStart, handleDragOver, handleDrop };
};


const PromptTemplateSetting = () => {
    // 创建派生信号，分别过滤系统提示词和用户提示词
    const systemPrompts = createMemo(() =>
        promptTemplates().map((p, i) => ({ ...p, originalIndex: i }))
            .filter(p => p.type === 'system')
    );

    const userPrompts = createMemo(() =>
        promptTemplates().map((p, i) => ({ ...p, originalIndex: i }))
            .filter(p => p.type === 'user')
    );

    const addTemplate = (type: 'system' | 'user') => {
        inputDialog({
            title: `新建${type === 'system' ? '系统' : '用户'}提示词模板`,
            confirm: (name) => {
                if (name) {
                    // 更新模板列表
                    promptTemplates.update(prev => [{
                        name: name,
                        content: '',
                        type: type
                    }, ...prev]);

                    // 直接打开编辑对话框
                    setTimeout(() => {
                        solidDialog({
                            title: '编辑 Prompt Template',
                            loader: () => (
                                <SimpleProvider state={{ updateTemplate, removeTemplate }}>
                                    <PromptTemplateEditForm index={() => 0} />
                                </SimpleProvider>
                            ),
                            width: '750px',
                            height: '600px'
                        });
                    }, 10);
                }
            }
        });
    };

    const removeTemplate = (target: number | string) => {
        confirmDialog({
            title: `确认删除 Prompt Template 配置 ${promptTemplates()[target].name}?`,
            content: ``,
            confirm: () => {
                if (typeof target === 'number') {
                    promptTemplates.update(prev => prev.filter((_, i) => i !== target));
                } else {
                    promptTemplates.update(prev => prev.filter(p => p.name !== target));
                }
            }
        });
    };

    const updateTemplate = (index: number, field: keyof IPromptTemplate, value: string) => {
        promptTemplates.update(index, field, value);
    };

    const { handleDragStart, handleDragOver, handleDrop } = useDndReorder();

    return (
        <SimpleProvider state={{ updateTemplate, removeTemplate }}>
            <div>
                <Form.Wrap
                    title="默认系统提示词"
                    description="系统提示词用于在对话开始时给用户提供一些引导"
                    direction="row"
                >
                    <Form.Input
                        type="textarea"
                        value={globalMiscConfigs().defaultSystemPrompt}
                        changed={(v) => globalMiscConfigs.update('defaultSystemPrompt', v)}
                        spellcheck={false}
                        style={{
                            "white-space": "pre-wrap"
                        }}
                    />
                </Form.Wrap>

                {/* 系统提示词部分 */}
                <div class={styles.sectionContainer}>
                    <Heading>
                        <div class={styles.headerContainer}>
                            <div class={`fn__flex-1 ${styles.headerTitle}`}>
                                系统提示词模板
                            </div>

                            <button
                                class="b3-button b3-button--text"
                                onClick={() => addTemplate('system')}
                            >
                                <SvgSymbol size="20px">iconAdd</SvgSymbol>
                            </button>
                        </div>
                    </Heading>

                    <div class={`fn__flex-1 ${styles.listContainer}`}>
                        {systemPrompts().length === 0 ? (
                            <div class={styles.emptyMessage}>
                                暂无系统提示词模板
                            </div>
                        ) : (
                            <For each={systemPrompts()}>
                                {(item) => (
                                    <div
                                        onDragOver={(e) => handleDragOver(e, item.originalIndex)}
                                        onDrop={handleDrop} style={{
                                            display: 'contents'
                                        }}
                                    >
                                        <PromptTemplateListItem
                                            index={() => item.originalIndex}
                                            dragHandle={handleDragStart}
                                        />
                                    </div>
                                )}
                            </For>
                        )}
                    </div>
                </div>

                {/* 用户提示词部分 */}
                <div class={styles.sectionContainer}>
                    <Heading>
                        <div class={styles.headerContainer}>
                            <div class={`fn__flex-1 ${styles.headerTitle}`}>
                                用户提示词模板
                            </div>

                            <button
                                class="b3-button b3-button--text"
                                onClick={() => addTemplate('user')}
                            >
                                <SvgSymbol size="20px">iconAdd</SvgSymbol>
                            </button>
                        </div>
                    </Heading>

                    <div class={`fn__flex-1 ${styles.listContainer}`}>
                        {userPrompts().length === 0 ? (
                            <div class={styles.emptyMessage}>
                                暂无用户提示词模板
                            </div>
                        ) : (
                            <For each={userPrompts()}>
                                {(item) => (
                                    <div
                                        onDragOver={(e) => handleDragOver(e, item.originalIndex)}
                                        onDrop={handleDrop} style={{
                                            display: 'contents'
                                        }}
                                    >
                                        <PromptTemplateListItem
                                            index={() => item.originalIndex}
                                            dragHandle={handleDragStart}
                                        />
                                    </div>
                                )}
                            </For>
                        )}
                    </div>
                </div>
            </div>
        </SimpleProvider>
    );
};

export default PromptTemplateSetting;