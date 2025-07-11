import { Accessor, Component, For, createSignal, onCleanup } from "solid-js";
import Form from "@/libs/components/Form";
import { providers } from "./store";
import Heading from "./Heading";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import { SvgSymbol } from "../chat/Elements";
import styles from "./SettingListStyles.module.scss";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { showMessage } from "siyuan";


const { SimpleProvider, useSimpleContext } = createSimpleContext<{
    updateProvider: (index: number, key: keyof IGPTProvider, value: any) => void;
    removeProvider: (target: number | string) => void;
}>();


const ProviderEditForm: Component<{
    index: Accessor<number>;
}> = (props) => {
    const { updateProvider } = useSimpleContext();

    const provider = () => providers()[props.index()];
    const index = () => props.index();
    const handleModelChange = (value: string) => {
        const models = value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        updateProvider(index(), 'models', models);
    }

    let initModels = provider().models.join('\n');
    let redirectString = createSignalRef(provider().redirect ? JSON.stringify(provider().redirect, null, 2) : '');

    const hidekey = createSignalRef(true);

    onCleanup(() => {
        if (!redirectString()) return;
        try {
            let parsed = JSON.parse(redirectString());
            updateProvider(index(), 'redirect', parsed);
        } catch (e) {
            showMessage(`无法解析 ${provider().name} 的重定向配置`)
        }
    })

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
                title="Provider 名称"
                description="用于区分不同的服务商"
            >
                <Form.Input
                    type="textinput"
                    value={provider().name}
                    changed={(v) => updateProvider(index(), 'name', v)}
                    style={{
                        width: '400px'
                    }}
                />
            </Form.Wrap>

            <Form.Wrap
                title="Completion API URL"
                description="完整的 API 接口地址, 包含可能的 /chat/completions 后缀"
                direction="row"
            >
                <Form.Input
                    type="textinput"
                    value={provider().url}
                    changed={(v) => updateProvider(index(), 'url', v)}
                    style={{
                        width: '100%'
                    }}
                />
            </Form.Wrap>

            <Form.Wrap
                title="API Key"
                description="API 密钥"
                direction="row"
                action={
                    <>
                        {/* Toggl Show API Key */}
                        <button class="b3-button b3-button--text" onclick={() => hidekey.update(!hidekey())}>
                            <SvgSymbol size="15px">iconEye</SvgSymbol>
                        </button>
                    </>
                }
            >
                <Form.Input
                    type="textinput"
                    value={provider().apiKey}
                    changed={(v) => updateProvider(index(), 'apiKey', v)}
                    password={hidekey()}
                    style={{
                        width: '100%'
                    }}
                />
            </Form.Wrap>

            <Form.Wrap
                title="支持的模型"
                description="支持的模型名称，使用英文逗号或者换行符分隔"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={initModels}
                    changed={handleModelChange}
                    style={{
                        width: "100%",
                        'font-size': '1.3em',
                        'line-height': '1.2em'
                    }}
                />
            </Form.Wrap>

            <Form.Wrap
                title="禁用该 Provider"
                description="禁用后，该 Provider 的模型将不会出现在模型选择列表中"
            >
                <Form.Input
                    type="checkbox"
                    value={provider().disabled || false}
                    changed={(v) => updateProvider(index(), 'disabled', v)}
                />
            </Form.Wrap>

            <Form.Wrap
                title="模型名称重定向"
                description={`如果有需要，可以使用 JSON 语法配置模型重定向 { "显示的模型名称": "发送给服务商的模型名称" }<br/> 此配置选项可以为空，此选项一般主要给字节火山平台适配使用`}
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={redirectString()}
                    changed={(value: string) => {
                        redirectString(value.trim())
                    }}
                    style={{
                        width: "100%",
                        'font-size': '1.3em',
                        'line-height': '1.2em'
                    }}
                />
            </Form.Wrap>
        </div>
    );
};

const ProviderListItem = (props: {
    index: Accessor<number>;
    dragHandle: (e: DragEvent, index: number) => void;
}) => {

    const { updateProvider, removeProvider } = useSimpleContext();

    const onEdit = () => {
        solidDialog({
            title: '编辑 Provider',
            loader: () => (
                <SimpleProvider state={{ updateProvider, removeProvider }}>
                    <ProviderEditForm index={props.index} />
                </SimpleProvider>
            ),
            width: '750px',
            height: '700px'
        })
    }

    const onDelete = () => {
        removeProvider(props.index());
    }
    return (
        <div
            draggable={true}
            onDragStart={(e: DragEvent) => props.dragHandle(e, props.index())}
            class={styles.listItem}
        >
            <span class={styles.listItemTitle}>
                {providers()[props.index()].name}
            </span>
            {providers()[props.index()].disabled && (
                <SvgSymbol size="15px">iconEyeoff</SvgSymbol>
            )}
            {/* <button class="b3-button b3-button--text" onclick={() => {
                // 将当前项移动到顶部
                providers.update(prev => {
                    const items = [...prev];
                    const [item] = items.splice(props.index(), 1);
                    items.unshift(item);
                    return items;
                });
            }}>
                <SvgSymbol size="15px">iconUp</SvgSymbol>
            </button>
            <button class="b3-button b3-button--text" onclick={() => {
                // 将当前项移动到底部
                providers.update(prev => {
                    const items = [...prev];
                    const [item] = items.splice(props.index(), 1);
                    items.push(item);
                    return items;
                });
            }}>
                <SvgSymbol size="15px">iconDown</SvgSymbol>
            </button> */}
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
        // console.log(_draggedIndex, _targetIndex);
        if (_draggedIndex !== null && _targetIndex !== null && _draggedIndex !== _targetIndex) {
            providers.update(prev => {
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

const ProviderSetting = () => {
    const addProvider = () => {
        inputDialog({
            title: '新建 Provider',
            confirm: (text) => {
                if (!text) return;
                providers.update(prev => [{
                    name: text,
                    url: '',
                    apiKey: '',
                    models: []
                }, ...prev]);

                // 直接打开编辑对话框
                setTimeout(() => {
                    solidDialog({
                        title: '编辑 Provider',
                        loader: () => (
                            <SimpleProvider state={{ updateProvider, removeProvider }}>
                                <ProviderEditForm index={() => 0} />
                            </SimpleProvider>
                        ),
                        width: '750px',
                        height: '600px'
                    });
                }, 10);
            },
        });
    };

    const removeProvider = (target: number | string) => {
        confirmDialog({
            title: `确认删除 Provider 配置 ${providers()[target].name}?`,
            content: `该 Provider 下的 ${providers()[target].models.length} 个 Model 将会被删除<br/>${providers()[target].models.join(', ')}`,
            confirm: () => {
                if (typeof target === 'number') {
                    providers.update(prev => prev.filter((_, i) => i !== target));
                } else {
                    providers.update(prev => prev.filter(p => p.name !== target));
                }
            }
        });
    };

    const updateProvider = (index: number, field: keyof IGPTProvider, value: string | string[]) => {
        providers.update(index, field, value);
    };

    const { handleDragStart, handleDragOver, handleDrop } = useDndReorder();

    return (
        <SimpleProvider state={{ updateProvider, removeProvider }}>
            <div>
                <Heading>
                    <div class={styles.headerContainer}>
                        <div class={`fn__flex-1 ${styles.headerTitle}`}>
                            Provider 配置
                        </div>

                        <button
                            class="b3-button b3-button--text"
                            onClick={addProvider}
                        >
                            <SvgSymbol size="20px">iconAdd</SvgSymbol>
                        </button>
                    </div>
                </Heading>

                <div class={`fn__flex-1 ${styles.listContainer}`}>
                    <For each={providers()}>
                        {(_, index) => (
                            <div
                                onDragOver={(e) => handleDragOver(e, index())}
                                onDrop={handleDrop}
                                style={{
                                    display: 'contents'
                                }}
                            >
                                <ProviderListItem index={index} dragHandle={handleDragStart} />
                            </div>
                        )}
                    </For>
                </div>
            </div>
        </SimpleProvider>

    );
};

export default ProviderSetting;