// h:\SrcCode\SiYuanDevelopment\sy-f-misc\src\func\gpt\setting\PromptTemplateSetting.tsx
import { Accessor, Component, For, createSignal } from "solid-js";
import Form from "@/libs/components/Form";
import { promptTemplates } from "./store";
import Heading from "./Heading";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import { SvgSymbol } from "../components/Elements";

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
            style={{
                display: 'flex',
                gap: '7px',
                'align-items': 'center',
                padding: '10px 16px',
                margin: '8px 22px',
                border: '1px solid var(--b3-border-color)',
                'border-radius': '4px',
                'box-shadow': '0 2px 4px var(--b3-theme-surface-light)'
            }}
        >
            <span style={{ flex: 1, "font-weight": "bold" }}>
                {promptTemplates()[props.index()].name}
            </span>
            <span class="counter">
                {promptTemplates()[props.index()].type}
            </span>
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
            promptTemplates.update(prev => {
                const items = [...prev];
                // 将 draggedIndex 移动到 targetIndex 的位置，其余的保持不变
                const draggedItem = items[_draggedIndex];
                items.splice(_draggedIndex, 1);
                items.splice(_targetIndex, 0, draggedItem);
                return items;
            });
        }
        setDraggedIndex(null);
        setTargetIndex(null);
    };


    return { handleDragStart, handleDragOver, handleDrop };
};


const PromptTemplateSetting = () => {
    const addTemplate = () => {
        inputDialog({
            title: "新建 Prompt Template",
            confirm: (name) => {
                if (name) {
                    promptTemplates.update(prev => [{
                        name: name,
                        content: '',
                        type: 'system'
                    }, ...prev]);
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
                <Heading>
                    预设提示词配置
                    <button
                        class="b3-button b3-button--text"
                        style={{
                            position: "absolute",
                            top: "0px",
                            right: "0px",
                        }}
                        onClick={addTemplate}
                    >
                        <SvgSymbol size="20px">iconAdd</SvgSymbol>
                    </button>
                </Heading>

                <div class="fn__flex-1">
                    <For each={promptTemplates()}>
                        {(template, index) => (
                            <div onDragOver={(e) => handleDragOver(e, index())} onDrop={handleDrop}>
                                <PromptTemplateListItem index={index} dragHandle={handleDragStart} />
                            </div>
                        )}
                    </For>
                </div>
            </div>
        </SimpleProvider>
    );
};

export default PromptTemplateSetting;