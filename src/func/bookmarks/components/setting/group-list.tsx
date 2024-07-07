import { createMemo, For, Switch, Match } from "solid-js";
import { groups, setGroups, itemInfo } from "../../model";
import { moveItem } from "../../libs/op";


const GroupIcon = (props: {
    groupType?: TBookmarkGroupType
}) => {
    return (
        <Switch fallback={<use href="#iconFolder"></use>}>
            <Match when={props.groupType === 'normal'}>
                <use href="#iconFolder"></use>
            </Match>
            <Match when={props.groupType === 'dynamic'}>
                <use href="#iconSearch"></use>
            </Match>
        </Switch>
    )
}


const App = () => {

    let Counts = createMemo(() => {
        let Cnt: { [key: string]: { indexed: number, closed: number, deleted: number } } = {};
        groups.forEach((group: IBookmarkGroup) => {
            let itemClosed = group.items.filter((it) => itemInfo[it.id]?.err === 'BoxClosed');
            let itemDelete = group.items.filter((it) => itemInfo[it.id]?.err === 'BlockDeleted');
            Cnt[group.id] = {
                closed: itemClosed.length,
                deleted: itemDelete.length,
                indexed: group.items.length - itemClosed.length - itemDelete.length
            }
        })
        return Cnt;
    })

    const onDragover = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const onDrop = (e: DragEvent) => {
        e.preventDefault();
        let srcGroupIdx: string = e.dataTransfer.getData("text/plain");
        e.dataTransfer.clearData();
        let target = (e.target as HTMLElement).closest(".bookmark-group") as HTMLElement;
        if (!target) return;
        let targetGroupIndex: string = target.dataset.index;
        let from = Number.parseInt(srcGroupIdx);
        let to = Number.parseInt(targetGroupIndex);
        if (from === to) return;

        setGroups((groups) => moveItem(groups, from, to));
    };

    return (
        <section
            class="fn__flex fn__flex-1 fn__flex-column bookmark-config-group-list"
            style={{
                border: '2px solid var(--b3-theme-primary-lighter)',
                'border-radius': '5px',
                padding: '15px 10px',
                gap: '10px'
            }}
        >
            <For each={groups}>
                {(group, i) => (
                    <li
                        class="bookmark-group b3-list-item"
                        style={{
                            gap: '10px',
                            height: '40px',
                            padding: '5px 10px',
                            'border-radius': '10px',
                            'box-shadow': '0 0 5px 3px rgba(0, 0, 0, 0.1)'
                        }}
                        data-index={i()}
                        data-group-id={group.id}
                        draggable="true"
                        onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", `${i()}`);
                        }}
                        onDragOver={onDragover}
                        onDrop={onDrop}
                    >
                        <svg class="b3-list-item__graphic">
                            <GroupIcon groupType={group.type}/>
                        </svg>
                        <span class="b3-list-item__text ariaLabel" data-position="parentE">
                            {group.name}
                        </span>
                        <span class="fn__space" />
                        <span class="counter ariaLabel" aria-label="Indexed" style={{ margin: 0, "background-color": "var(--b3-card-success-background)" }}>
                            {Counts()[group.id].indexed}
                        </span>
                        <span class="counter ariaLabel" aria-label="Box Closed" style={{ margin: 0, "background-color": "var(--b3-card-warning-background)" }}>
                            {Counts()[group.id].closed}
                        </span>
                        <span class="counter ariaLabel" aria-label="Not Found" style={{ margin: 0, "background-color": "var(--b3-card-error-background)" }}>
                            {Counts()[group.id].deleted}
                        </span>
                        <span class="fn__space" />
                        <div class="fn__flex fn__flex-center">
                            <input
                                class="b3-switch fn__flex-center"
                                checked={group.hidden === true ? false : true}
                                type="checkbox"
                                onChange={() => {
                                    setGroups((g) => g.id === group.id, 'hidden', (hidden) => !hidden);
                                }}
                            />
                        </div>
                    </li>
                )}
            </For>
        </section>
    )
}

export default App;
