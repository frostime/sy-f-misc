import { createMemo, createSignal, Show } from "solid-js";

import ItemWrap from "@/libs/components/item-wrap";
import InputItem from "@/libs/components/item-input";

interface IPrpos {
    setGroup: (arg: { name?: string, type?: TBookmarkGroupType }) => void;
    setRule: (arg: { type?: string, input?: '' }) => void;
}

const NewGroup = (props: IPrpos) => {
    // let grouptype = 'normal';
    let [groupType, setGroupType] = createSignal("normal");
    let [ruleType, setRuleType] = createSignal("sql");

    let aboutRule = createMemo(() => {
        switch (ruleType()) {
            case 'SQL':
                return {
                    desc: "请在下方输入 SQL 查询",
                    direction: "row",
                    input: "textarea"
                }

            case 'backlinks':
                return {
                    desc: "请输入反链的块 ID",
                    direction: "column",
                    input: "textinput"
                }

            case 'attr':
                return {
                    desc: "请输入要查找的属性",
                    direction: "column",
                    input: "textinput"
                }

            default:
                break;
        }
        return {
            desc: "请在下方输入 SQL 查询",
            direction: "row",
            input: "textarea"
        };
    });

    return (
        <div class="config__tab-container fn__flex fn__flex-1 fn__flex-column"
            onkeydown={(e) => {
                if (e.key === 'Enter') {
                    e.stopImmediatePropagation(); // 防止 enter 让 dialog 直接 confirm 了
                }
            }}
        >
            <ItemWrap
                title="书签组名称"
                description="请输入新建书签组名称"
            >
                <InputItem
                    key="name"
                    value=""
                    type="textinput"
                    changed={(v) => {
                        props.setGroup({ name: v });
                    }}
                />
            </ItemWrap>
            <ItemWrap
                title="书签组类型"
                description="选择书签组类型"
            >
                <InputItem
                    key="type"
                    value={groupType()}
                    type="select"
                    options={{
                        normal: '普通书签',
                        dynamic: '动态书签',
                        // composed: '复合书签'
                    }}
                    changed={(v) => {
                        props.setGroup({ type: v });
                        setGroupType(v);
                        if (v !== 'normal') {
                            props.setRule({ type: ruleType() });
                        }
                    }}
                />
            </ItemWrap>
            <Show when={groupType() !== 'normal'}>
                <ItemWrap
                    title="规则类型"
                    description="选择动态规则类型"
                >
                    <InputItem
                        key="ruleType"
                        value={ruleType()}
                        type="select"
                        options={{
                            sql: 'SQL',
                            backlinks: '反向链接',
                            attr: '块属性'
                        }}
                        changed={(v) => {
                            props.setRule({ type: v });
                            setRuleType(v);
                        }}
                    />
                </ItemWrap>
                <ItemWrap
                    title="规则取值"
                    description={aboutRule().desc}
                    //@ts-ignore
                    direction={aboutRule().direction}
                >
                    <InputItem
                        key="ruleInput"
                        value=''
                        //@ts-ignore
                        type={aboutRule().input}
                        changed={(v) => {
                            props.setRule({ input: v });
                        }}
                    />
                </ItemWrap>
            </Show>
        </div>
    )
}

export default NewGroup;
