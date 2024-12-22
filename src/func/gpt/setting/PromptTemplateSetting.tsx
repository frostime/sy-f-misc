import { For } from "solid-js";
import Form from "@/libs/components/Form";
import { promptTemplates } from "./store";
import Heading from "./Heading";
import { confirm } from "siyuan";

const PromptTemplateSetting = () => {
    const addTemplate = () => {
        promptTemplates.update(prev => [...prev, {
            name: '',
            content: '',
            type: 'system'
        }]);
    };

    const removeTemplate = (index: number) => {
        promptTemplates.update(prev => prev.filter((_, i) => i !== index));
    };

    const updateTemplate = (index: number, field: keyof IPromptTemplate, value: string) => {
        promptTemplates.update(index, field, () => value);
    };

    return (
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
                    添加
                </button>
            </Heading>

            <For each={promptTemplates()}>
                {(template, index) => (
                    <div style={{
                        "border": "2px dashed var(--b3-theme-secondary)",
                        "border-radius": "4px",
                        "margin": "16px",
                        "position": "relative"
                    }}>
                        <Form.Wrap
                            title="模板名称"
                            description="用于识别模板的名称"
                        >
                            <Form.Input
                                type="textinput"
                                value={template.name}
                                changed={(v) => updateTemplate(index(), 'name', v)}
                            />
                        </Form.Wrap>

                        <Form.Wrap
                            title="提示词类型"
                            description="系统提示词或用户提示词"
                        >
                            <Form.Input
                                type="select"
                                value={template.type}
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
                                value={template.content}
                                changed={(v) => updateTemplate(index(), 'content', v)}
                                style={{
                                    height: '100px',
                                    width: '100%'
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
                                confirm('确认删除?', `将删除模板 "${template.name}"`, () => {
                                    removeTemplate(index());
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

export default PromptTemplateSetting;