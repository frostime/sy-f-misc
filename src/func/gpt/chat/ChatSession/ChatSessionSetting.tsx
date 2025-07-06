import Form from '@/libs/components/Form';
import { UIConfig, promptTemplates } from '@gpt/setting/store';
import { ChatSetting } from '@gpt/setting';

import { useSimpleContext } from './ChatSession.helper';


export const useSessionSetting = () => {
    let context = useSimpleContext();
    let { config, session } = context;

    const availableSystemPrompts = (): Record<string, string> => {
        const systemPrompts = promptTemplates().filter(item => item.type === 'system');
        return systemPrompts.reduce((acc, cur) => {
            acc[cur.content] = cur.name;
            return acc;
        }, { '': 'No Prompt' });
    }

    return (
        <div class="fn__flex-1">
            <Form.Wrap
                title="System Prompt"
                description="附带的系统级提示消息"
                direction="row"
                action={
                    <Form.Input
                        type="select"
                        value={""}
                        changed={(v) => {
                            v = v.trim();
                            if (v) {
                                session.systemPrompt(v);
                            }
                        }}
                        options={availableSystemPrompts()}
                    />
                }
            >
                <Form.Input
                    type="textarea"
                    value={session.systemPrompt()}
                    changed={(v) => {
                        session.systemPrompt(v);
                    }}
                    style={{
                        height: '7em',
                        "font-size": UIConfig().inputFontsize + "px",
                        "line-height": "1.35"
                    }}
                />
            </Form.Wrap>
            <ChatSetting config={config} />
        </div>
    )

}