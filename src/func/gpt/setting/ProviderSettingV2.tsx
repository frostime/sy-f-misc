import { Component, createSignal, For, Show, onMount, Accessor } from "solid-js";
import Form from "@/libs/components/Form";
import { llmProviders } from "./store";
import { confirmDialog, inputDialog } from "@frostime/siyuan-plugin-kits";
import { createSimpleContext } from "@/libs/simple-context";
import { solidDialog } from "@/libs/dialog";
import { SvgSymbol } from "../chat/Elements";
import styles from "./SettingListStyles.module.scss";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { showMessage } from "siyuan";
import { BasicDraggableList, CollapsibleDraggableList } from "@/libs/components/drag-list";
import { createModelConfig } from "./preset";
import Heading from "./Heading";
// import { Button } from "@frostime/siyuan-plugin-kits/element";
import { ButtonInput } from "@/libs/components/Elements";
import { LeftRight } from "@/libs/components/Elements/Flex";
// import { deepMerge } from "@frostime/siyuan-plugin-kits";

// ============================================
// Types
// ============================================

type TabType = 'basic' | 'models';

// ============================================
// Context for Provider Editing
// ============================================

const { SimpleProvider: ProviderEditProvider, useSimpleContext: useProviderEditContext } = createSimpleContext<{
    providerIndex: Accessor<number>;
    updateProvider: (field: keyof ILLMProviderV2, value: any) => void;
    updateModel: (modelIndex: number, field: keyof ILLMConfigV2, value: any) => void;
    addModel: () => void;
    removeModel: (index: number) => void;
}>();

// ============================================
// Model Configuration Panel (Right Side)
// ============================================

const ModelConfigPanel: Component<{
    model: ILLMConfigV2;
    modelIndex: number;
    onClose: () => void;
}> = (props) => {
    const { updateModel, providerIndex } = useProviderEditContext();

    const provider = () => llmProviders()[providerIndex()];

    const model = () => props.model;
    const index = () => props.modelIndex;

    // 模态能力选择
    // const availableModalities: LLMModality[] = ['text', 'image', 'file', 'audio', 'video'];
    const availableModalities: LLMModality[] = ['text', 'image', 'file'];

    const toggleModality = (direction: 'input' | 'output', modality: LLMModality) => {
        const current = model().modalities[direction] || [];
        const newList = current.includes(modality)
            ? current.filter(m => m !== modality)
            : [...current, modality];

        updateModel(index(), 'modalities', {
            ...model().modalities,
            [direction]: newList
        });
    };

    const updateCapability = (key: keyof ILLMConfigV2['capabilities'], value: boolean) => {
        updateModel(index(), 'capabilities', {
            ...model().capabilities,
            [key]: value
        });
    };

    const updateLimit = (key: string, value: any) => {
        updateModel(index(), 'limits', {
            ...model().limits,
            [key]: value
        });
    };

    const updatePrice = (field: 'inputPerK' | 'outputPerK' | 'unit', value: any) => {
        const price = model().price || { inputPerK: 0, outputPerK: 0, unit: 'USD' };
        updateModel(index(), 'price', {
            ...price,
            [field]: value
        });
    };

    const updateUnsupportedOptions = (value: string) => {
        const options = value.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
        updateModel(index(), 'options', {
            ...model().options,
            unsupported: options
        });
    };

    const updateCustomOverride = (value: string) => {
        try {
            const parsed = value.trim() ? JSON.parse(value) : {};
            updateModel(index(), 'options', {
                ...model().options,
                customOverride: parsed
            });
        } catch (e) {
            showMessage('自定义参数格式错误，请使用 JSON 格式');
        }
    };

    return (
        <div style={{
            'height': '100%',
            'overflow-y': 'auto',
            'padding': '20px',
        }}>
            <LeftRight
                containerStyle={{ 'margin-bottom': '20px' }}
                left={
                    <h3 style={{
                        // margin: '5px 24px',
                        // padding: '5px 0',
                        color: 'var(--b3-theme-primary)',
                        'flex': '1',
                        'text-align': 'center'
                    }}>
                        {model().model}@{provider().name}
                    </h3>
                }
                right={
                    <button class="b3-button b3-button--text" onClick={props.onClose}>
                        <SvgSymbol size="18px">iconClose</SvgSymbol>
                    </button>
                }

            />

            <div style={{ 'margin-top': '20px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>

                {/* 基本信息 */}
                <Form.Wrap title="模型 ID" description="实际发送给 API 的模型名称" direction="row">
                    <Form.Input
                        type="textinput"
                        value={model().model}
                        changed={(v) => updateModel(index(), 'model', v)}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>

                <Form.Wrap title="显示名称" description="在界面中显示的名称（可选）" direction="row">
                    <Form.Input
                        type="textinput"
                        value={model().displayName || ''}
                        changed={(v) => updateModel(index(), 'displayName', v || undefined)}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>

                <Form.Wrap title="服务类型" description="决定使用哪个 endpoint">
                    <Form.Input
                        type="select"
                        value={model().type}
                        options={{
                            'chat': '对话 (chat)',
                            'embeddings': '向量 (embeddings)',
                            'image': '图像生成 (image)',
                            'audio_stt': '语音转文本 (audio_stt)',
                            'audio_tts': '文本转语音 (audio_tts)'
                        }}
                        changed={(v) => updateModel(index(), 'type', v)}
                    />
                </Form.Wrap>
            </div>



            {/* 模态能力 */}
            <div style={{ 'margin-top': '20px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>
                <Form.Wrap title="模态" description="模型允许的输入输出模态" direction="row">

                    <LeftRight
                        left={<strong>输入</strong>}
                        right={
                            <div style={{ 'display': 'flex', 'flex-wrap': 'wrap', 'gap': '8px', 'margin-top': '8px' }}>
                                <For each={availableModalities}>
                                    {(modality) => (
                                        <label style={{ 'display': 'flex', 'align-items': 'center', 'gap': '4px' }}>
                                            <input
                                                type="checkbox"
                                                checked={model().modalities.input?.includes(modality)}
                                                onChange={() => toggleModality('input', modality)}
                                            />
                                            <span>{modality}</span>
                                        </label>
                                    )}
                                </For>
                            </div>
                        }
                    />

                    <LeftRight
                        left={<strong>输出</strong>}
                        right={
                            <div style={{ 'display': 'flex', 'flex-wrap': 'wrap', 'gap': '8px', 'margin-top': '8px' }}>
                                <For each={availableModalities}>
                                    {(modality) => (
                                        <label style={{ 'display': 'flex', 'align-items': 'center', 'gap': '4px' }}>
                                            <input
                                                type="checkbox"
                                                checked={model().modalities.output?.includes(modality)}
                                                onChange={() => toggleModality('output', modality)}
                                            />
                                            <span>{modality}</span>
                                        </label>
                                    )}
                                </For>
                            </div>
                        }
                    />

                </Form.Wrap>


            </div>

            {/* 能力标记 */}
            <div style={{ 'margin-top': '20px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>
                {/* <h4 style={{ 'margin-top': '0' }}>功能支持 (Capabilities)</h4> */}

                <For each={[
                    { key: 'streaming', label: '流式输出 (Streaming)', desc: '支持 SSE 流式响应' },
                    { key: 'tools', label: '工具调用 (Tools)', desc: '支持 function calling' },
                    // { key: 'reasoning', label: '推理模式 (Reasoning)', desc: '支持 reasoning_content' },
                    // { key: 'jsonMode', label: 'JSON 模式', desc: '支持 response_format: json_object' }
                ] as const}>
                    {(item) => (
                        <Form.Wrap title={item.label} description={item.desc}>
                            <Form.Input
                                type="checkbox"
                                value={model().capabilities[item.key] ?? false}
                                changed={(v) => updateCapability(item.key, v)}
                            />
                        </Form.Wrap>
                    )}
                </For>
            </div>

            {/* 限制参数 */}
            {/* #TODO 暂时隐藏 */}
            {/* <div style={{ 'margin-top': '20px', 'padding': '16px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>
                <h4 style={{ 'margin-top': '0' }}>限制参数 (Limits)</h4>

                <Form.Wrap title="最大上下文 (tokens)" description="Context Window" direction="row">
                    <Form.Input
                        type="number"
                        value={model().limits?.maxContext || 0}
                        changed={(v) => updateLimit('maxContext', parseInt(v) || undefined)}
                        number={{ min: 0, step: 1000 }}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>

                <Form.Wrap title="最大输出 (tokens)" description="Max Output Tokens" direction="row">
                    <Form.Input
                        type="number"
                        value={model().limits?.maxOutput || 0}
                        changed={(v) => updateLimit('maxOutput', parseInt(v) || undefined)}
                        number={{ min: 0, step: 100 }}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>
            </div> */}

            {/* 价格配置 */}
            {/* #TODO 暂时隐藏 */}
            {/* <div style={{ 'margin-top': '20px', 'padding': '16px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>
                <h4 style={{ 'margin-top': '0' }}>价格 (Price - 可选)</h4>

                <Form.Wrap title="输入价格 (每1K tokens)" description="Input Price" direction="row">
                    <Form.Input
                        type="number"
                        value={model().price?.inputPerK || 0}
                        changed={(v) => updatePrice('inputPerK', parseFloat(v) || 0)}
                        number={{ min: 0, step: 0.001 }}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>

                <Form.Wrap title="输出价格 (每1K tokens)" description="Output Price" direction="row">
                    <Form.Input
                        type="number"
                        value={model().price?.outputPerK || 0}
                        changed={(v) => updatePrice('outputPerK', parseFloat(v) || 0)}
                        number={{ min: 0, step: 0.001 }}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>

                <Form.Wrap title="货币单位" description="Currency Unit">
                    <Form.Input
                        type="select"
                        value={model().price?.unit || 'USD'}
                        options={{
                            'USD': 'USD (美元)',
                            'CNY': 'CNY (人民币)'
                        }}
                        changed={(v) => updatePrice('unit', v)}
                        fn_size={false}
                        style={{ width: '100%' }}
                    />
                </Form.Wrap>
            </div> */}

            {/* 高级选项 */}
            <div style={{ 'margin-top': '20px', 'border': '1px solid var(--b3-border-color)', 'border-radius': '4px' }}>
                {/* <h4 style={{ 'margin-top': '0' }}>高级选项</h4> */}

                <Form.Wrap
                    title="不支持的参数"
                    description="不支持的 ChatOption 参数，用逗号或换行分隔（如: frequency_penalty, presence_penalty）"
                    direction="row"
                >
                    <Form.Input
                        type="textarea"
                        value={(model().options?.unsupported || []).join('\n')}
                        changed={updateUnsupportedOptions}
                        style={{ width: '100%', height: '80px' }}
                    />
                </Form.Wrap>

                <Form.Wrap
                    title="自定义参数覆盖"
                    description={`强制覆盖的参数，JSON 格式（如: {\" reasoning_effort\": \"medium\"}）`}
                    direction="row"
                >
                    <Form.Input
                        type="textarea"
                        value={JSON.stringify(model().options?.customOverride || {}, null, 2)}
                        changed={updateCustomOverride}
                        style={{ width: '100%', height: '100px', 'font-family': 'monospace' }}
                    />
                </Form.Wrap>
            </div>
        </div >
    );
};

// ============================================
// Provider Basic Config Component
// ============================================

const ProviderBasicConfig: Component = () => {
    const { providerIndex, updateProvider } = useProviderEditContext();
    const provider = () => llmProviders()[providerIndex()];
    const hideApiKey = createSignalRef(true);

    const updateEndpoint = (type: string, path: string) => {
        const endpoints = { ...provider().endpoints };
        if (path.trim()) {
            endpoints[type] = path;
        } else {
            delete endpoints[type];
        }
        updateProvider('endpoints', endpoints);
    };

    const updateCustomHeaders = (value: string) => {
        try {
            const parsed = value.trim() ? JSON.parse(value) : undefined;
            updateProvider('customHeaders', parsed);
        } catch (e) {
            showMessage('自定义请求头格式错误，请使用 JSON 格式');
        }
    };

    return (
        <div style={{ 'padding': '16px' }}>
            {/* <h3 style={{ 'margin-top': '0' }}>Provider 基本配置</h3> */}
            <Heading>基本配置</Heading>

            <Form.Wrap title="Provider 名称" description="用于区分不同的服务商">
                <Form.Input
                    type="textinput"
                    value={provider().name}
                    changed={(v) => updateProvider('name', v)}
                    style={{ width: '400px' }}
                />
            </Form.Wrap>

            <Form.Wrap title="Base URL" description="API 基础地址（不含 endpoint），如: https://api.openai.com/v1" direction="row">
                <Form.Input
                    type="textinput"
                    value={provider().baseUrl}
                    changed={(v) => updateProvider('baseUrl', v)}
                    style={{ width: '100%' }}
                />
            </Form.Wrap>

            <Form.Wrap title="API Key" description="API 密钥" direction="row"
                action={
                    <button class="b3-button b3-button--text" onClick={() => hideApiKey.update(!hideApiKey())}>
                        <SvgSymbol size="15px">iconEye</SvgSymbol>
                    </button>
                }
            >
                <Form.Input
                    type="textinput"
                    value={provider().apiKey}
                    changed={(v) => updateProvider('apiKey', v)}
                    password={hideApiKey()}
                    style={{ width: '100%' }}
                />
            </Form.Wrap>

            <Form.Wrap title="禁用该 Provider" description="禁用后，该 Provider 的模型将不会出现在选择列表中">
                <Form.Input
                    type="checkbox"
                    value={provider().disabled ?? false}
                    changed={(v) => updateProvider('disabled', v)}
                />
            </Form.Wrap>

            {/* Endpoints 配置 */}
            <Heading>Endpoints</Heading>


            <For each={[
                { key: 'chat', label: 'Chat', default: '/chat/completions' },
                { key: 'embeddings', label: 'Embeddings', default: '/embeddings' },
                { key: 'image', label: 'Image', default: '/images/generations' }
            ]}>
                {(item) => (
                    <Form.Wrap
                        title={`${item.label} Endpoint`}
                        description={`默认: ${item.default}`}
                        direction="row"
                    >
                        <Form.Input
                            type="textinput"
                            value={provider().endpoints?.[item.key] || ''}
                            changed={(v) => updateEndpoint(item.key, v)}
                            placeholder={item.default}
                            style={{ width: '100%' }}
                        />
                    </Form.Wrap>
                )}
            </For>

            {/* 自定义请求头 */}
            <Heading>其他自定义</Heading>
            <Form.Wrap
                title="自定义请求头 (可选)"
                description="额外的 HTTP 请求头，JSON 格式"
                direction="row"
            >
                <Form.Input
                    type="textarea"
                    value={JSON.stringify(provider().customHeaders || {}, null, 2)}
                    changed={updateCustomHeaders}
                    style={{ width: '100%', height: '100px', 'font-family': 'monospace' }}
                />
            </Form.Wrap>
        </div>
    );
};

// ============================================
// Models List Component with Drawer
// ============================================

const ModelsListPanel: Component = () => {
    const { providerIndex, updateProvider, addModel, removeModel } = useProviderEditContext();
    const [selectedModelIndex, setSelectedModelIndex] = createSignal<number | null>(null);

    const provider = () => llmProviders()[providerIndex()];
    const models = () => provider()?.models || [];

    const handleAddModel = () => {
        inputDialog({
            title: '添加模型',
            defaultText: '输入模型 ID（如: gpt-4o-2024-05-13）',
            confirm: (modelName) => {
                if (!modelName?.trim()) return;

                // 使用预设配置创建模型
                const newModel = createModelConfig(modelName.trim());

                const currentModels = models();
                updateProvider('models', [...currentModels, newModel]);

                // 自动选中新添加的模型
                setSelectedModelIndex(currentModels.length);
            },
            width: '450px'
        });
    };

    const handleRemoveModel = (index: number) => {
        const model = models()[index];
        confirmDialog({
            title: '确认删除模型',
            content: `确定要删除模型 "${model.displayName || model.model}" 吗？`,
            confirm: () => {
                if (selectedModelIndex() === index) {
                    setSelectedModelIndex(null);
                }
                removeModel(index);
            }
        });
    };

    const handleModelOrder = (newModels: ILLMConfigV2[]) => {
        updateProvider('models', newModels);
    };

    return (
        <div style={{
            'display': 'flex',
            'gap': '16px',
            'height': '100%',
            'padding': '16px',
            'overflow': 'hidden'
        }}>
            {/* 左侧：模型列表 */}
            <div style={{
                // 'flex': selectedModelIndex() !== null ? '0 0 400px' : '1',
                'flex': '1',
                'transition': 'flex 0.3s ease',
                'min-width': '300px',
                'overflow': 'hidden',
                'display': 'flex',
                'flex-direction': 'column'
            }}>

                <LeftRight
                    containerStyle={{
                        margin: '5px 20px'
                    }}
                    left={<span class="b3-label__text">共{models().length}个模型</span>}
                    right={(
                        <ButtonInput onClick={() => {
                            // e.stopPropagation();
                            handleAddModel();
                        }}>
                            <SvgSymbol size="18px">{'iconAdd'}</SvgSymbol>
                        </ButtonInput>
                    )}
                />
                <BasicDraggableList

                    items={models().map((m, i) => ({ ...m, name: m.displayName || m.model, id: i }))}
                    // onAdd={handleAddModel}
                    listContainerClass={`fn__flex-1 ${styles.listContainer}`}
                    itemClass={styles.listItem}
                    onOrderChange={(newItems) => {
                        const newModels = newItems.map(item => {
                            const { name, id, ...rest } = item;
                            return rest as ILLMConfigV2;
                        });
                        handleModelOrder(newModels);
                    }}
                    onEdit={(item) => {
                        const index = models().findIndex(m => (m.displayName || m.model) === item.name);
                        setSelectedModelIndex(index);
                    }}
                    onDelete={(item) => {
                        const index = models().findIndex(m => (m.displayName || m.model) === item.name);
                        if (index !== -1) handleRemoveModel(index);
                    }}
                    renderBadge={(item) => {
                        const model = item as any as ILLMConfigV2;
                        return (
                            <div style={{ 'display': 'flex', 'gap': '4px', 'font-size': '12px', 'color': 'var(--b3-theme-on-surface-light)' }}>
                                <span style={{ 'background': 'var(--b3-theme-primary)', 'padding': '2px 6px', 'border-radius': '3px', 'color': 'var(--b3-theme-on-primary)' }}>
                                    {model.type}
                                </span>
                                {/* <Show when={model.modalities?.input?.includes('image')}>
                                    <span title="支持图片输入">
                                        <SvgSymbol size="14px">iconImage</SvgSymbol>
                                    </span>
                                </Show> */}
                            </div>
                        );
                    }}
                />
            </div>

            {/* 右侧：抽屉式配置面板 */}
            <div style={{
                'width': selectedModelIndex() !== null ? "unset" : '0',
                'flex': selectedModelIndex() !== null ? '1' : 'unset',
                'overflow': 'hidden',
                'transition': 'width 0.3s ease',
                'border-left': selectedModelIndex() !== null ? '1px solid var(--b3-border-color)' : 'none',
                'display': 'flex',
                'flex-direction': 'column'
            }}>
                <Show when={selectedModelIndex() !== null}>
                    <ModelConfigPanel
                        model={models()[selectedModelIndex()!]}
                        modelIndex={selectedModelIndex()!}
                        onClose={() => setSelectedModelIndex(null)}
                    />
                </Show>
            </div>
        </div>
    );
};

// ============================================
// Tab Button Component
// ============================================

const TabButton = (props: {
    active: boolean;
    onClick: () => void;
    children: any;
}) => {
    return (
        <button
            class={`b3-button b3-button--text`}
            style={{
                "padding": "12px 0",
                "border-radius": "0",
                "font-weight": props.active ? "bold" : "normal",
                // "background-color": 'var(--b3-theme-background)',
                "border-bottom": props.active ? "2px solid var(--b3-theme-primary)" : "none",
                "flex": "1",
                "min-width": "120px",
                "font-size": "14px",
                "color": props.active ? "var(--b3-theme-primary)" : "var(--b3-theme-on-surface)"
            }}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    );
};

// ============================================
// Provider Edit Form
// ============================================

const ProviderEditForm: Component<{
    providerIndex: Accessor<number>;
}> = (props) => {
    const provider = () => llmProviders()[props.providerIndex()];
    const index = () => props.providerIndex();
    const [activeTab, setActiveTab] = createSignal<TabType>('basic');

    const updateProvider = (field: keyof ILLMProviderV2, value: any) => {
        llmProviders.update(index(), field, value);
    };

    const updateModel = (modelIndex: number, field: keyof ILLMConfigV2, value: any) => {
        const models = [...provider().models];
        models[modelIndex] = { ...models[modelIndex], [field]: value };
        updateProvider('models', models);
    };

    const addModel = () => {
        // 由 ModelsListPanel 处理
    };

    const removeModel = (modelIndex: number) => {
        const models = provider().models.filter((_, i) => i !== modelIndex);
        updateProvider('models', models);
    };

    return (
        <ProviderEditProvider state={{
            providerIndex: () => index(),
            updateProvider,
            updateModel,
            addModel,
            removeModel
        }}>
            <div style={{
                'display': 'flex',
                'flex-direction': 'column',
                'height': '100%',
                'width': '100%',
                'overflow': 'hidden',
                background: 'var(--b3-theme-background)',
                zoom: 1.2
            }}>
                {/* Tab Bar */}
                <div style={{
                    display: 'flex',
                    width: '100%',
                    "border-bottom": "1px solid var(--b3-border-color)",
                    // "background-color": "var(--b3-theme-background)",
                    'flex-shrink': '0'
                }}>
                    <TabButton
                        active={activeTab() === 'basic'}
                        onClick={() => setActiveTab('basic')}
                    >
                        基本配置
                    </TabButton>
                    <TabButton
                        active={activeTab() === 'models'}
                        onClick={() => setActiveTab('models')}
                    >
                        模型列表
                    </TabButton>
                </div>

                {/* Tab Content - 统一滚动容器 */}
                <div style={{
                    'flex': '1',
                    'overflow-y': 'auto',
                    'overflow-x': 'hidden',
                    'width': '100%'
                }}>
                    <Show when={activeTab() === 'basic'}>
                        <ProviderBasicConfig />
                    </Show>

                    <Show when={activeTab() === 'models'}>
                        <ModelsListPanel />
                    </Show>
                </div>
            </div>
        </ProviderEditProvider>
    );
};

// ============================================
// Main Component: ProviderSettingV2
// ============================================

const ProviderSettingV2 = () => {
    const openEditDialog = (index: number) => {
        solidDialog({
            title: `编辑 Provider: ${llmProviders()[index].name}`,
            loader: () => <ProviderEditForm providerIndex={() => index} />,
            width: '1300px',
            height: '80vh'
        });
    };

    const addProvider = () => {
        inputDialog({
            title: '新建 Provider',
            defaultText: '输入 Provider 名称（如: OpenAI, Claude 等）',
            type: 'textline',
            confirm: (name) => {
                if (!name?.trim()) return;

                const newProvider: ILLMProviderV2 = {
                    name: name.trim(),
                    baseUrl: '',
                    endpoints: {
                        chat: '/chat/completions'
                    },
                    apiKey: '',
                    disabled: false,
                    models: []
                };

                llmProviders.update(prev => [newProvider, ...prev]);

                // 直接打开编辑对话框
                setTimeout(() => openEditDialog(0), 10);
            },
            width: '450px'
        });
    };

    const removeProvider = (index: number) => {
        const provider = llmProviders()[index];
        confirmDialog({
            title: `确认删除 Provider: ${provider.name}?`,
            content: `该 Provider 下的 ${provider.models?.length || 0} 个模型将会被删除`,
            confirm: () => {
                llmProviders.update(prev => prev.filter((_, i) => i !== index));
            }
        });
    };

    return (
        // <div class={styles.sectionContainer} >

        // </div>
        <>
            <LeftRight
                containerStyle={{
                    margin: '5px 24px'
                }}
                left={<span class="b3-label__text">LLM Provider 配置 - 共{llmProviders().length}个Provider</span>}
                right={(
                    <ButtonInput onClick={addProvider}>
                        <SvgSymbol size="18px">{'iconAdd'}</SvgSymbol>
                    </ButtonInput>
                )}
            />
            <BasicDraggableList
                items={llmProviders().map((p, i) => ({ ...p, id: i }))}
                listContainerClass={`fn__flex-1 ${styles.listContainer}`}
                itemClass={styles.listItem}
                onOrderChange={(newItems) => {
                    const newProviders = newItems.map(item => {
                        const { id, ...rest } = item;
                        return rest as ILLMProviderV2;
                    });
                    llmProviders(newProviders);
                }}
                onEdit={(item) => {
                    const index = llmProviders().findIndex(p => p.name === item.name);
                    if (index !== -1) openEditDialog(index);
                }}
                onDelete={(item) => {
                    const index = llmProviders().findIndex(p => p.name === item.name);
                    if (index !== -1) removeProvider(index);
                }}
                renderBadge={(item) => (
                    <>
                        <Show when={item.disabled}>
                            <SvgSymbol size="15px">iconEyeoff</SvgSymbol>
                        </Show>
                        <span style={{
                            'font-size': '12px',
                            'color': 'var(--b3-theme-on-surface-light)',
                            'margin-left': '8px'
                        }}>
                            {item.models?.length || 0} 个模型
                        </span>
                    </>
                )}
                emptyText="暂无 Provider 配置，点击右上角 + 按钮添加"
            />
        </>
    );
};

export default ProviderSettingV2;
