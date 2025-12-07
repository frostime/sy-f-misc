// h:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\setting\PromptTemplateSetting.tsx
import { Accessor, Component, createMemo } from "solid-js";
import Form from "@/libs/components/Form";
import { globalMiscConfigs, promptTemplates } from "./store";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import styles from "./SettingListStyles.module.scss";
import { CollapsibleDraggableList } from "@/libs/components/drag-list";

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


// 带有原始索引的模板类型，用于分组显示
type PromptTemplateWithIndex = IPromptTemplate & { originalIndex: number };

const PromptTemplateSetting = () => {
    const updateTemplate = (index: number, field: keyof IPromptTemplate, value: string) => {
        promptTemplates.update(index, field, value);
    };

    const openEditDialog = (index: number) => {
        solidDialog({
            title: '编辑 Prompt Template',
            loader: () => (
                <SimpleProvider state={{ updateTemplate, removeTemplate }}>
                    <PromptTemplateEditForm index={() => index} />
                </SimpleProvider>
            ),
            width: '750px',
            height: '600px'
        });
    };

    const addTemplate = (type: 'system' | 'user') => {
        inputDialog({
            title: `新建${type === 'system' ? '系统' : '用户'}提示词模板`,
            confirm: (name) => {
                if (name) {
                    promptTemplates.update(prev => [{
                        name: name,
                        content: '',
                        type: type
                    }, ...prev]);

                    // 直接打开编辑对话框
                    setTimeout(() => openEditDialog(0), 10);
                }
            }
        });
    };

    const removeTemplate = (target: number | string) => {
        const template = typeof target === 'number' ? promptTemplates()[target] : promptTemplates().find(p => p.name === target);
        if (!template) return;

        confirmDialog({
            title: `确认删除 Prompt Template 配置 ${template.name}?`,
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

    // 创建派生信号，分别过滤系统提示词和用户提示词
    const systemPrompts = createMemo((): PromptTemplateWithIndex[] =>
        promptTemplates().map((p, i) => ({ ...p, originalIndex: i }))
            .filter(p => p.type === 'system')
    );

    const userPrompts = createMemo((): PromptTemplateWithIndex[] =>
        promptTemplates().map((p, i) => ({ ...p, originalIndex: i }))
            .filter(p => p.type === 'user')
    );

    // 移动到组内顶部
    const moveToTop = (item: PromptTemplateWithIndex) => {
        const currentIndex = item.originalIndex;
        const currentType = item.type;

        promptTemplates.update(prev => {
            const items = [...prev];
            const [movedItem] = items.splice(currentIndex, 1);

            // 找到同类型的第一个项的索引
            const firstSameTypeIndex = items.findIndex(p => p.type === currentType);

            if (firstSameTypeIndex !== -1) {
                items.splice(firstSameTypeIndex, 0, movedItem);
            } else {
                items.unshift(movedItem);
            }

            return items;
        });
    };

    // 移动到组内底部
    const moveToBottom = (item: PromptTemplateWithIndex) => {
        const currentIndex = item.originalIndex;
        const currentType = item.type;

        promptTemplates.update(prev => {
            const items = [...prev];
            const [movedItem] = items.splice(currentIndex, 1);

            // 找到同类型的最后一个项的索引
            const lastSameTypeIndex = [...items].reverse().findIndex(p => p.type === currentType);

            if (lastSameTypeIndex !== -1) {
                const actualIndex = items.length - 1 - lastSameTypeIndex;
                items.splice(actualIndex + 1, 0, movedItem);
            } else {
                items.push(movedItem);
            }

            return items;
        });
    };

    // 处理拖拽排序变化（基于 originalIndex 更新原始数组）
    const handleOrderChange = (newItems: PromptTemplateWithIndex[]) => {
        // 获取新顺序中的 originalIndex 列表
        const newOrder = newItems.map(item => item.originalIndex);

        promptTemplates.update(prev => {
            // 将重排后的项放回原数组对应位置
            const movedItems = newOrder.map(idx => prev[idx]);
            const otherItems = prev.filter((_, i) => !newOrder.includes(i));

            // 找到这些项在原数组中的位置范围
            const minIndex = Math.min(...newOrder);

            // 将排序后的项插入到正确位置
            return [
                ...otherItems.slice(0, minIndex),
                ...movedItems,
                ...otherItems.slice(minIndex)
            ];
        });
    };

    // 通用的列表属性
    const listProps = (items: () => PromptTemplateWithIndex[]) => ({
        items: items(),
        containerClass: `fn__flex-1 ${styles.listContainer}`,
        itemClass: styles.listItem,
        onOrderChange: handleOrderChange,
        canDrop: (dragged: PromptTemplateWithIndex, target: PromptTemplateWithIndex) => dragged.type === target.type,
        showMoveButtons: true,
        onMoveUp: moveToTop,
        onMoveDown: moveToBottom,
        onEdit: (item: PromptTemplateWithIndex) => openEditDialog(item.originalIndex),
        onDelete: (item: PromptTemplateWithIndex) => removeTemplate(item.originalIndex),
        renderBadge: (item: PromptTemplateWithIndex) => (
            <span class="counter">{item.type}</span>
        )
    });

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
                <CollapsibleDraggableList
                    title="系统提示词模板"
                    onAdd={() => addTemplate('system')}
                    emptyText="暂无系统提示词模板"
                    wrapperClass={styles.sectionContainer}
                    listContainerStyle={{ 'margin': '0 24px' }}
                    {...listProps(systemPrompts)}
                />

                <div style={{ 'height': '32px' }}></div>

                {/* 用户提示词部分 */}
                <CollapsibleDraggableList
                    title="用户提示词模板"
                    onAdd={() => addTemplate('user')}
                    emptyText="暂无用户提示词模板"
                    wrapperClass={styles.sectionContainer}
                    listContainerStyle={{ 'margin': '0 24px' }}
                    {...listProps(userPrompts)}
                />
            </div>
        </SimpleProvider>
    );
};

export default PromptTemplateSetting;