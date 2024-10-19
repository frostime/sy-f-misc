import { Component, createMemo, For } from "solid-js";
import { createStore } from "solid-js/store";
import Table from "@/libs/components/Table";
import { SimpleContextProvider, useSimpleContext } from "@/libs/simple-context";

import { BlockTypeShort } from "@/utils/const";
import { getNotebook } from "@/utils";

import { FormInput } from "@/libs/components/Form";
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
                            no: "无行为",
                            samepath: "迁移到当前Box的相同路径下",
                            dailynote: "迁移到当前Box的日记中",
                            childdoc: "迁移到单独的子文档中",
                            thisdoc: "迁移到当前文档中",
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
    refBlocks: Block[]  // 反链块
}> = (props) => {

    const refBlocks = createSignalRef(props.refBlocks);

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
        let result = await doMove(refBlock, props.defBlock, action);
    }

    return (
        <SimpleContextProvider state={{
            defBlock: props.defBlock, refBlocks: refBlocks
        }}>
            <section style={{ padding: '20px 15px', width: '100%' }}>
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
            </section>
        </SimpleContextProvider>
    );
};

export default RefsTable;