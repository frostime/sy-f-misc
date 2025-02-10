import { Accessor, Component, createMemo, For, onMount, Show } from "solid-js";
import Table from "@/libs/components/Table";
import { getNotebook, BlockTypeShort, matchIDFormat, id2block } from "@frostime/siyuan-plugin-kits";
import { createSignalRef, createStoreRef } from "@frostime/solid-signal-ref";
import * as api from '@/api';
import { showMessage } from "siyuan";
import type FMiscPlugin from "@/index";
import TextInput from "@/libs/components/text-input";
import { fb2p } from "@/libs";

function isnot(value: any) {
    if (value === undefined || value === null) {
        return true;
    } else if (value === false) {
        return true;
    } else if (typeof value === 'string' && value.trim() === '') {
        return true;
    } else if (value?.length === 0) {
        return true;
    }
    return false;
}

const A = (props: { id: string, children: any }) => (
    <a class="popover__block" data-id={props.id} href={`siyuan://blocks/${props.id}`}>
        {props.children}
    </a>
);

async function getChildDocs(block: BlockId, limit = 64) {
    let sqlCode = `select * from blocks where path regexp '.*/${block}/[0-9a-z\-]+\.sy' and type='d'
    order by hpath desc limit ${limit};`;
    let childDocs = await api.sql(sqlCode);
    return childDocs;
}

const DestinationSelect = (props: { srcBlock: BlockId, onSelect: (id: BlockId) => void }) => {
    const parent = createSignalRef<Block>(null);
    const siblings = createSignalRef<Block[]>([]);
    const children = createSignalRef<Block[]>([]);
    const selected = createSignalRef<BlockId>("");

    onMount(async () => {
        const srcBlock: Block = await api.getBlockByID(props.srcBlock);
        const path = srcBlock.path.slice(1);
        const pathParts = path.split("/");
        let parentId: BlockId = null;

        if (pathParts.length > 1) {
            parentId = pathParts[pathParts.length - 2];
            const blocks = await id2block(parentId);
            if (blocks.length > 0) {
                parent(blocks[0] as Block);
            }
        }

        if (parentId) {
            let sibs = await getChildDocs(parentId);
            sibs = sibs ?? [];
            siblings(sibs);
        }

        let childs: Block[] | undefined = await getChildDocs(srcBlock.root_id);
        childs = childs ?? [];
        children(childs);

        console.log(parent(), siblings(), children());
    });

    const handleSelect = (id: BlockId) => {
        selected(id);
        props.onSelect(id);
    };

    const BlockOption = (props: { block: Block }) => {
        const isSelected = () => selected() === props.block.id;
        return (
            <div 
                class="fn__flex b3-list-item" 
                style={{ "align-items": "center", "cursor": "pointer" }}
                onClick={() => handleSelect(props.block.id)}
            >
                <input
                    type="radio"
                    class="b3-radio"
                    name="destination"
                    value={props.block.id}
                    checked={isSelected()}
                    onChange={(e) => e.stopPropagation()}
                />
                <span class="b3-list-item__text">{props.block.hpath}</span>
            </div>
        );
    };

    return (
        <div class="fn__flex-column b3-list b3-list--background" style={{ gap: "8px" }}>
            <Show when={parent()}>
                <div>
                    <div class="b3-list__item">
                        <div class="b3-list-item__text">父文档</div>
                    </div>
                    <BlockOption block={parent()} />
                </div>
            </Show>

            <Show when={siblings().length > 0}>
                <div>
                    <div class="b3-list__item">
                        <div class="b3-list-item__text">同级文档</div>
                    </div>
                    <div>
                        <For each={siblings()}>
                            {block => <BlockOption block={block} />}
                        </For>
                    </div>
                </div>
            </Show>

            <Show when={children().length > 0}>
                <div>
                    <div class="b3-list__item">
                        <div class="b3-list-item__text">子文档</div>
                    </div>
                    <div>
                        <For each={children()}>
                            {block => <BlockOption block={block} />}
                        </For>
                    </div>
                </div>
            </Show>
        </div>
    );
};

const TransferRefs: Component<{
    plugin: FMiscPlugin,
    srcBlockID: BlockId
}> = (props) => {
    // const refBlocks = createSignalRef<Block[]>([]);
    // const selectedRefs = createSignalRef<BlockId[]>([]);
    const selectedRefs = createStoreRef<{ block: Block, checked: boolean, redirected: Block }[]>([]);

    const selectedDst = createSignalRef<BlockId>("");
    // const allChecked = createSignalRef(false);
    const allChecked = () => {
        const checked = selectedRefs().filter(ref => ref.checked);
        return checked.length === selectedRefs().length;
    }

    const checkedRefs: Accessor<BlockId[]> = createMemo(() => {
        return selectedRefs().filter(ref => ref.checked).map(ref => ref.block.id);
    })

    onMount(async () => {
        const sqlQuery = `select * from blocks where id in (
            select block_id from refs where def_block_id = '${props.srcBlockID}' limit 999) order by updated desc limit 999`;
        const blocks: Block[] = await api.sql(sqlQuery);
        const redirected = await fb2p(structuredClone(blocks)) as Block[];
        selectedRefs(blocks.map((block, index) => ({ block, checked: false, redirected: redirected[index] })));
    });

    const handleTransfer = async () => {
        if (selectedRefs().length === 0) {
            showMessage('请选择需要转移的链接');
            return;
        }
        if (!selectedDst()) {
            showMessage('请选择目标块');
            return;
        }

        let sql = `select * from blocks where id = "${selectedDst()}" limit 1`;
        let result: Block[] = await api.sql(sql);
        if (isnot(result)) {
            showMessage(`目标块 ${selectedDst()} 不存在`);
            return;
        }
        api.transferBlockRef(props.srcBlockID, selectedDst(), checkedRefs());
    };

    const Row = (props: {
        block: Block, redirected: Block, checked: boolean, select: (checked: boolean) => void
    }) => {
        const isFb2p = () => props.block.id !== props.redirected.id;

        return (
            <Table.Row>
                <Table.Cell>
                    <input
                        type="checkbox"
                        value={props.block.id}
                        checked={props.checked}
                        onChange={(e) => {
                            props.select(e.currentTarget.checked);
                        }}
                    />
                </Table.Cell>
                <Table.Cell>
                    <A id={props.redirected.id}>{props.block.content}</A>
                </Table.Cell>
                <Table.Cell>
                    {BlockTypeShort[props.block.type] ?? 'Unknown'}
                </Table.Cell>
                <Table.Cell>
                    {isFb2p() ? BlockTypeShort[props.redirected.type] : '-'}
                </Table.Cell>
                <Table.Cell>
                    {getNotebook(props.block.box).name}
                </Table.Cell>
                <Table.Cell>
                    {props.block.hpath}
                </Table.Cell>
            </Table.Row>
        );
    }

    return (
        <div class="fn__flex" style={{ height: "100%", flex: 1 }}>
            <div class="fn__flex-1">
                <Table.Body
                    columns={[
                        <div style={{ display: 'flex', "align-items": 'center', gap: '8px' }}>
                            <input
                                type="checkbox"
                                checked={allChecked()}
                                onChange={(e) => {
                                    selectedRefs.update(refs => {
                                        return refs.map(ref => ({ ...ref, checked: e.currentTarget.checked }))
                                    });
                                }}
                            />
                        </div>,
                        "内容",
                        "源类型",
                        "重定向为",
                        "笔记本",
                        "文档"
                    ]}
                    styles={{ 'font-size': '16px' }}
                >
                    <For each={selectedRefs()}>
                        {(ref, index) => (
                            <Row
                                block={ref.block}
                                checked={ref.checked}
                                redirected={ref.redirected}
                                select={(checked: boolean) => {
                                    selectedRefs.update(index(), 'checked', checked)
                                }}
                            />
                        )}
                    </For>
                </Table.Body>
            </div>
            <div class="fn__flex" style={{
                padding: "8px", "flex-direction": "column", gap: '5px',
                'min-width': '200px'
            }}>
                <div style={{ display: 'flex', "align-items": 'center', gap: '8px' }}>
                    <TextInput text={selectedDst()} update={id => selectedDst(id)} />
                    <button class="b3-button b3-button--text" onClick={handleTransfer}>
                        转移引用
                    </button>
                </div>
                <DestinationSelect srcBlock={props.srcBlockID} onSelect={(id) => {
                    if (id && matchIDFormat(id)) {
                        selectedDst(id);
                    }
                }} />
            </div>
        </div>
    );
};

export default TransferRefs;
