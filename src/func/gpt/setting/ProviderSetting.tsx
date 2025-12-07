import { Accessor, Component, onCleanup } from "solid-js";
import Form from "@/libs/components/Form";
import { providers } from "./store";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import { SvgSymbol } from "../chat/Elements";
import styles from "./SettingListStyles.module.scss";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { showMessage } from "siyuan";
import { CollapsibleDraggableList } from "@/libs/components/drag-list";


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

const ProviderSetting = () => {
    const updateProvider = (index: number, field: keyof IGPTProvider, value: string | string[]) => {
        providers.update(index, field, value);
    };

    const openEditDialog = (index: number) => {
        solidDialog({
            title: '编辑 Provider',
            loader: () => (
                <SimpleProvider state={{ updateProvider, removeProvider }}>
                    <ProviderEditForm index={() => index} />
                </SimpleProvider>
            ),
            width: '750px',
            height: '700px'
        });
    };

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
                setTimeout(() => openEditDialog(0), 10);
            },
        });
    };

    const removeProvider = (target: number | string) => {
        const provider = typeof target === 'number' ? providers()[target] : providers().find(p => p.name === target);
        if (!provider) return;

        confirmDialog({
            title: `确认删除 Provider 配置 ${provider.name}?`,
            content: `该 Provider 下的 ${provider.models.length} 个 Model 将会被删除<br/>${provider.models.join(', ')}`,
            confirm: () => {
                if (typeof target === 'number') {
                    providers.update(prev => prev.filter((_, i) => i !== target));
                } else {
                    providers.update(prev => prev.filter(p => p.name !== target));
                }
            }
        });
    };

    return (
        <SimpleProvider state={{ updateProvider, removeProvider }}>
            <CollapsibleDraggableList
                title="Provider 配置"
                items={providers()}
                onAdd={addProvider}
                listContainerClass={`fn__flex-1 ${styles.listContainer}`}
                itemClass={styles.listItem}
                wrapperClass={styles.sectionContainer}
                listContainerStyle={{ 'margin': '0 24px' }}
                onOrderChange={(newItems) => providers.update(newItems)}
                onEdit={(item) => {
                    const index = providers().findIndex(p => p.name === item.name);
                    if (index !== -1) openEditDialog(index);
                }}
                onDelete={(item) => {
                    const index = providers().findIndex(p => p.name === item.name);
                    if (index !== -1) removeProvider(index);
                }}
                renderBadge={(item) => (
                    item.disabled ? <SvgSymbol size="15px">iconEyeoff</SvgSymbol> : null
                )}
            />
        </SimpleProvider>
    );
};

export default ProviderSetting;