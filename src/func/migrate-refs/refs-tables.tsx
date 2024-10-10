import { Component, createMemo, For } from "solid-js";
import { createStore } from "solid-js/store";
import Table from "@/libs/components/Table";
import { SimpleContextProvider, useSimpleContext } from "@/libs/simple-context";

import { BlockTypeShort } from "@/utils/const";
import { getNotebook } from "@/utils";

import { FormInput } from "@/libs/components/Form";


const useCheckStatus = (refBlocks: Block[]) => {
    let [status, setStatus] = createStore(Object.fromEntries(refBlocks.map(refBlock => [refBlock.id, false])));
    const setAll = (checked: boolean) => {
        for (let refBlock of refBlocks) {
            setStatus(refBlock.id, checked);
        }
    }

    return { status, setStatus, setAll };
}

const A = (props: { id: string, children: any }) => (
    <a class="popover__block" data-id={props.id} href={`siyuan://blocks/${props.id}`}>
        {props.children}
    </a>
);

const Row = (props: { refBlock: Block }) => {

    let { defBlock } = useSimpleContext();

    let notebookName = createMemo(() => {
        let notebook = getNotebook(props.refBlock.box);
        return notebook.name;
    });

    let boxWarn = () => {
        if (props.refBlock.box !== defBlock.box) return { background: 'var(--b3-card-warning-background)' };
        else if (props.refBlock.root_id === defBlock.root_id) return { background: 'var(--b3-card-success-background)' };
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
                        value="no"
                        options={{
                            no: "无行为",
                            thisdoc: "迁移到当前文档中",
                            childdoc: "迁移到单独的子文档中",
                            samepath: "迁移到当前Box的相同路径下"
                        }}
                    />
                    <FormInput
                        type="button"
                        key="migrate"
                        value="GO!"
                        style={{ 'width': 'unset', padding: '2px 5px' }}
                    />
                </div>
            </Table.Cell>
        </Table.Row>
    );
}

const RefsTable: Component<{
    defBlock: Block,
    refBlocks: Block[]
}> = (props) => {

    // const { status, setStatus, setAll } = useCheckStatus(props.refBlocks);

    return (
        <SimpleContextProvider state={{
            defBlock: props.defBlock, refBlocks: props.refBlocks,
            // checkedStatus: status, setCheckedStatus: setStatus
        }}>
            <section style={{ padding: '20px 15px', width: '100%' }}>
                <Table.Body columns={["block", "type", "notebook", "hpath", "迁移"]} styles={{ 'font-size': '18px' }}>
                    <For each={props.refBlocks}>
                        {
                            (refBlock) => (
                                <Row refBlock={refBlock} />
                            )
                        }
                    </For>
                </Table.Body>
            </section>
        </SimpleContextProvider>
    );
};

export default RefsTable;