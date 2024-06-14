import { createMemo, For } from "solid-js";
import { groups, setGroups } from "../../model";


const App = () => {

    let orderedGroups = createMemo(() => {
        return groups.slice().sort((a, b) => a.order - b.order);
    });

    const onDragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const onDrop = (e) => {
        e.preventDefault();
        let srcGroupId = e.dataTransfer.getData("text/plain");
        e.dataTransfer.clearData();
        let target = e.target.closest(".bookmark-group") as HTMLElement;
        if (!target) return;
        let targetGroupId = target.dataset.groupId;
        let targetGroup = groups.find(g => g.id === targetGroupId);
        // let temp = groups[index];
        // groups[index] = groups[data];
        // groups[data] = temp;
        setGroups((g) => g.id === srcGroupId, 'order', targetGroup.order - 1);
    };

    return (
        <section
            class="fn__flex fn__flex-1 fn__flex-column"
            style={{
                border: '2px solid var(--b3-theme-primary-lighter)',
                'border-radius': '5px',
                padding: '15px 10px',
                gap: '10px'
            }}
        >
            <For each={orderedGroups()}>
            {(group, i) => (
                <li
                    class="bookmark-group ariaLabel b3-list-item"
                    style={{
                        gap: '10px',
                        height: '40px',
                        padding: '5px 10px',
                        'border-radius': '10px',
                        'box-shadow': '0 0 5px 3px rgba(0, 0, 0, 0.1)'
                    }}
                    aria-label={group.id}
                    data-index={i}
                    data-group-id={group.id}
                    draggable="true"
                    onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", group.id);
                    }}
                    onDragOver={onDragover}
                    onDrop={onDrop}
                >
                    <svg class="b3-list-item__graphic">
                        <use href="#iconFolder"></use>
                    </svg>
                    <span class="b3-list-item__text ariaLabel" data-position="parentE">
                        {group.name}
                    </span>
                    <span class="fn__space" />
                    <span class="counter">{group.items.length}</span>
                    <span class="fn__space" />
                    <div class="fn__flex fn__flex-center">
                        <input
                            class="b3-switch fn__flex-center"
                            checked={group.hidden === true? false: true}
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
