import { For } from "solid-js";
import Form from "@/libs/components/Form";
import { providers } from "./store";
import Heading from "./Heading";
import { confirm } from "siyuan";

const ProviderSetting = () => {
    const addProvider = () => {
        providers.update(prev => [...prev, {
            name: '',
            url: '',
            apiKey: '',
            models: []
        }]);
    };

    const removeProvider = (index: number) => {
        providers.update(prev => prev.filter((_, i) => i !== index));
    };

    const updateProvider = (index: number, field: keyof IGPTProvider, value: string) => {
        providers.update(index, field, () => {
            if (field === 'models') {
                return value.split(',').map(m => m.trim());
            } else {
                return value;
            }
        });
    };

    return (
        <div>
            <Heading>
                Provider 配置
                <button
                    class="b3-button b3-button--text"
                    style={{
                        position: "absolute",
                        top: "0px",
                        right: "0px",
                    }}
                    onClick={addProvider}
                >
                    添加
                </button>
            </Heading>

            <For each={providers()}>
                {(provider, index) => (
                    <div style={{
                        "border": "2px dashed var(--b3-theme-secondary)",
                        "border-radius": "4px",
                        "margin": "16px",
                        "position": "relative"
                    }}>
                        <Form.Wrap
                            title="Provider 名称"
                            description="用于区分不同的服务商"
                        >
                            <Form.Input
                                type="textinput"
                                value={provider.name}
                                changed={(v) => updateProvider(index(), 'name', v)}
                            />
                        </Form.Wrap>

                        <Form.Wrap
                            title="API URL"
                            description="完整的 API 接口地址"
                        >
                            <Form.Input
                                type="textinput"
                                value={provider.url}
                                changed={(v) => updateProvider(index(), 'url', v)}
                            />
                        </Form.Wrap>

                        <Form.Wrap
                            title="API Key"
                            description="API 密钥"
                        >
                            <Form.Input
                                type="textinput"
                                value={provider.apiKey}
                                changed={(v) => updateProvider(index(), 'apiKey', v)}
                                password={true}
                            />
                        </Form.Wrap>

                        <Form.Wrap
                            title="支持的模型"
                            description="支持的模型名称，使用英文逗号分隔"
                            direction="row"
                        >
                            <Form.Input
                                type="textinput"
                                value={provider.models.join(', ')}
                                changed={(v) => updateProvider(index(), 'models', v)}
                                style={{
                                    width: "100%"
                                }}
                            />
                        </Form.Wrap>

                        <button
                            class="b3-button b3-button--text"
                            style={{
                                position: "absolute",
                                top: "-5px",
                                left: "-5px",
                                padding: '0px',
                                color: "var(--b3-theme-error)"
                            }}
                            onClick={() => {
                                confirm('确认删除?', `将删除第 ${index() + 1} 个 Provider 配置 ${provider.name}`, () => {
                                    removeProvider(index());
                                })
                            }}
                        >
                            <svg><use href="#iconTrashcan"></use></svg>
                        </button>
                    </div>
                )}
            </For>
        </div>
    );
};

export default ProviderSetting;
