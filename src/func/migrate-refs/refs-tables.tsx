import { Component, createMemo, For, onMount } from "solid-js";
import Table from "@/libs/components/Table";
import { SimpleContextProvider, useSimpleContext } from "@/libs/simple-context";

// import { BlockTypeShort } from "@/utils/const";
// import { getNotebook } from "@/utils";
import { getNotebook, BlockTypeShort } from "@frostime/siyuan-plugin-kits";

import { FormInput, FormWrap } from "@/libs/components/Form";
import { createSignalRef } from "@frostime/solid-signal-ref";
import { doMove } from "./move";
import { getBlockByID } from "@/api";
import { showMessage } from "siyuan";


const A = (props: { id: string, children: any }) => (
    <a class="popover__block" data-id={props.id} href={`siyuan://blocks/${props.id}`}>
        {props.children}
    </a>
);

const Row = (props: { refBlock: Block, doMigrate: (id: BlockId, action: TMigrate) => void }) => {

    let { defBlock } = useSimpleContext() as {
        defBlock: Block
    };

    let action = createSignalRef<TMigrate>('no');

    let notebookName = createMemo(() => {
        let notebook = getNotebook(props.refBlock.box);
        return notebook.name;
    });

    let boxWarn = () => {
        if (props.refBlock.box !== defBlock.box) return { background: 'var(--b3-card-warning-background)' };
        else if (props.refBlock.root_id === defBlock.root_id) return { opacity: 0.2 };
        else return {};
    }


    return (
        <Table.Row styles={boxWarn()}>
            <Table.Cell>
                <A id={props.refBlock.id}>{props.refBlock.fcontent || props.refBlock.content}</A>
            </Table.Cell>
            <Table.Cell>
                {BlockTypeShort[props.refBlock.type] ?? 'Unknown'}
            </Table.Cell>
            <Table.Cell>
                {notebookName()}
            </Table.Cell>
            <Table.Cell>
                <A id={props.refBlock.root_id}>{props.refBlock.hpath}</A>
            </Table.Cell>
            <Table.Cell>
                <div style={{ display: 'flex', gap: '3px', "align-items": 'center' }}>
                    <FormInput
                        type="select"
                        key="actions"
                        value={action()}
                        options={{
                            no: "No Action",
                            thisdoc: "This Doc",
                            childdoc: "Child Doc",
                            dailynote: "Daily Note",
                            inbox: "Inbox",
                        }}
                        changed={(value: TMigrate) => action(value)}
                    />
                    <FormInput
                        type="button"
                        key="migrate"
                        value="GO!"
                        style={{ 'width': 'unset', padding: '2px 5px' }}
                        button={{
                            label: 'GO!',
                            callback: () => props.doMigrate(props.refBlock.id, action())
                        }}
                    />
                </div>
            </Table.Cell>
        </Table.Row>
    );
}

const RefsTable: Component<{
    defBlock: Block,  // 主文档块
    queryRefBlocks: (fb2p?: boolean) => Promise<Block[]>  // 反链块
}> = (props) => {

    const refBlocks = createSignalRef<Block[]>([]);

    const ifFb2p = createSignalRef(true);

    const inboxHpath = createSignalRef('/Inbox');

    const updateRefBlocks = async () => {
        props.queryRefBlocks().then(async (blocks) => {
            if (ifFb2p()) {
                blocks = await globalThis.Query.fb2p(blocks);
            }
            refBlocks(blocks);
        });
    }

    onMount(async () => {
        updateRefBlocks();
    });

    const notSameDoc = refBlocks.derived((blocks: Block[]) => {
        return blocks.filter(block => block.root_id !== props.defBlock.root_id);
    });

    const doMigrate = async (refBlockId: BlockId, action: TMigrate) => {
        console.log(`迁移引用块: ${refBlockId}; 行为: ${action}`);
        const refBlock = await getBlockByID(refBlockId);
        if (!refBlock) {
            showMessage(`引用块 ${refBlockId} 不存在`, 3000, 'error');
            return;
        }
        let result = await doMove(refBlock, props.defBlock, action, {
            inboxHpath: inboxHpath()
        });
        if (result) {
            showMessage("迁移完成!")
            setTimeout(updateRefBlocks, 1000);
        }
    }

    return (
        <SimpleContextProvider state={{
            defBlock: props.defBlock, refBlocks: refBlocks
        }}>
            <section style={{ padding: '20px 15px', width: '100%' }}>
                <FormWrap
                    title="查询"
                    description=""
                >
                    <div style={{ display: 'flex', gap: '10px', "align-items": 'center' }}>
                        <span>是否 fb2p</span>
                        <FormInput
                            type="checkbox"
                            key="fb2p"
                            value={ifFb2p()}
                            changed={(value: boolean) => { ifFb2p(value); updateRefBlocks(); }}
                        />
                        <FormInput
                            type="button"
                            key="query"
                            value="重新查询"
                            fn_size={false}
                            button={{
                                label: "重新查询",
                                callback: () => updateRefBlocks()
                            }}
                        />
                    </div>
                </FormWrap>
                <FormWrap
                    title="Inbox 目录 (Hpath)"
                    description=""
                >
                    <FormInput
                        type="textinput"
                        key="inboxHpath"
                        value={inboxHpath()}
                        changed={(value: string) => { inboxHpath(value); }}
                    />
                </FormWrap>
                <div style={{ margin: '8px 24px' }}>
                    <Table.Body
                        columns={["block", "type", "notebook", "hpath", "迁移"]}
                        styles={{ 'font-size': '18px' }}
                    >
                        <For each={notSameDoc()}>
                            {
                                (refBlock) => (
                                    <Row refBlock={refBlock} doMigrate={doMigrate} />
                                )
                            }
                        </For>
                    </Table.Body>
                </div>
            </section>
        </SimpleContextProvider>
    );
};

export default RefsTable;