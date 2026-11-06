/**
 * 模型选择面板。
 *
 * 分工：
 * - 过滤 / 分组 / 价格文本 / 比价等纯逻辑在 model/model_entry_view.ts，可直接单测；
 * - 本组件只负责 DOM、定位、键盘与悬浮交互。
 *
 * 布局约定：按 provider 分组且默认全部展开；行内只显示模型名、能力图标和最淡的一档价格，
 * 完整信息在悬浮详情里。挂到 body 上（Portal），避免被对话浮层的 overflow 裁剪。
 */
import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import { listAvailableModelEntries, type IAvailableModelEntry } from '../../model/store';
import {
    capabilitiesOf,
    compareSameModel,
    compactPriceText,
    contextText,
    filterModelEntries,
    fullPriceText,
    groupModelEntries,
} from '../../model/model_entry_view';
import styles from './ModelPicker.module.scss';

const IconTools = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
        <path d="M10.6 2.2a3.6 3.6 0 014.2 4.2l-8 8-4.2-4.2z" stroke-linejoin="round" />
    </svg>
);
const IconReasoning = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2.6v10.8M8 4.4C6.4 3.2 3.5 3.8 3.5 6.1c0 .9.5 1.5 1.2 1.9-.6.4-1 1-1 1.8 0 1.9 2.2 2.8 4.3 1.4M8 4.4c1.6-1.2 4.5-.6 4.5 1.7 0 .9-.5 1.5-1.2 1.9.6.4 1 1 1 1.8 0 1.9-2.2 2.8-4.3 1.4" />
    </svg>
);
const IconVision = () => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
        <path d="M1.6 8S4.1 3.9 8 3.9 14.4 8 14.4 8 11.9 12.1 8 12.1 1.6 8 1.6 8z" />
        <circle cx="8" cy="8" r="1.9" />
    </svg>
);

export const ModelPicker: Component<{
    currentId: string;
    /** 触发按钮的位置；面板贴它下方，空间不足时翻到上方 */
    anchor: DOMRect;
    /** 触发按钮本身；点它不算"点外部"，关闭与重开由调用方 toggle */
    anchorElement?: HTMLElement;
    onPick: (id: ModelBareId) => void;
    onClose: () => void;
}> = (props) => {
    const allEntries = listAvailableModelEntries();

    const [query, setQuery] = createSignal('');
    const [focusIndex, setFocusIndex] = createSignal(-1);
    const [hovered, setHovered] = createSignal<{ entry: IAvailableModelEntry; element: HTMLElement } | null>(null);
    const [tipStyle, setTipStyle] = createSignal<{ left: string; top: string }>({ left: '0px', top: '0px' });
    const [panelStyle, setPanelStyle] = createSignal<{ left: string; top: string }>({ left: '0px', top: '0px' });
    /** 位置需要挂载后测量，测量完成前先隐藏，避免闪一下左上角 */
    const [positioned, setPositioned] = createSignal(false);

    let panelRef: HTMLDivElement | undefined;
    let tipRef: HTMLDivElement | undefined;
    let inputRef: HTMLInputElement | undefined;
    const rowElements = new Map<string, HTMLElement>();

    const groups = createMemo(() => groupModelEntries(filterModelEntries(allEntries, query())));
    const flatEntries = createMemo(() => groups().flatMap(group => group.entries));
    const focusedEntry = createMemo(() => flatEntries()[focusIndex()] ?? null);

    const moveFocus = (delta: number) => {
        const entries = flatEntries();
        if (entries.length === 0) return;
        const next = focusIndex() < 0
            ? (delta > 0 ? 0 : entries.length - 1)
            : Math.min(entries.length - 1, Math.max(0, focusIndex() + delta));
        setFocusIndex(next);
        rowElements.get(entries[next].id)?.scrollIntoView({ block: 'nearest' });
    };

    onMount(() => {
        if (panelRef) {
            const rect = panelRef.getBoundingClientRect();
            const { anchor } = props;
            let left = anchor.left;
            let top = anchor.bottom + 6;
            if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
            if (top + rect.height > window.innerHeight - 8) top = Math.max(8, anchor.top - rect.height - 6);
            setPanelStyle({ left: `${Math.max(8, left)}px`, top: `${top}px` });
            setPositioned(true);
        }
        inputRef?.focus();

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as Node;
            if (panelRef?.contains(target) || props.anchorElement?.contains(target)) return;
            props.onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            // 输入法组合期间的上/下/回车属于候选词选择，不能当成菜单导航
            if (event.isComposing) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                props.onClose();
            } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                moveFocus(1);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                moveFocus(-1);
            } else if (event.key === 'Enter') {
                const entry = focusedEntry();
                if (!entry) return;
                event.preventDefault();
                props.onPick(entry.id);
            }
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        onCleanup(() => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        });
    });

    // 悬浮面板贴在被悬停行的右侧，越界则翻到左侧；纵向按视口高度夹紧
    createEffect(() => {
        const current = hovered();
        if (!current || !tipRef) return;
        const rect = current.element.getBoundingClientRect();
        const tipWidth = tipRef.offsetWidth;
        const tipHeight = tipRef.offsetHeight;
        let left = rect.right + 10;
        if (left + tipWidth > window.innerWidth - 8) left = rect.left - tipWidth - 10;
        const top = Math.min(Math.max(8, rect.top - 6), window.innerHeight - tipHeight - 8);
        setTipStyle({ left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px` });
    });

    return (
        <Portal>
            <div
                ref={panelRef}
                class={`${styles.panel}${positioned() ? ` ${styles.ready}` : ''}`}
                style={panelStyle()}
            >
                <div class={styles.searchRow}>
                    <label class={styles.search}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
                            <circle cx="6.8" cy="6.8" r="4.6" /><path d="M10.4 10.4L14 14" stroke-linecap="round" />
                        </svg>
                        <input
                            ref={inputRef}
                            value={query()}
                            placeholder="搜索模型 / provider"
                            autocomplete="off"
                            onInput={(event) => {
                                setQuery(event.currentTarget.value);
                                setFocusIndex(-1);
                                setHovered(null);
                                rowElements.clear();
                            }}
                        />
                    </label>
                </div>

                <div class={styles.list} onScroll={() => setHovered(null)}>
                    <For each={groups()}>
                        {(group) => (
                            <>
                                <div class={styles.groupHead}>
                                    <span class={styles.groupName}>{group.provider}</span>
                                    <span class={styles.groupMeta}>
                                        {[group.symbol ? `${group.symbol}每M` : '', `${group.entries.length} 个`]
                                            .filter(Boolean).join(' · ')}
                                    </span>
                                </div>
                                <For each={group.entries}>
                                    {(entry) => (
                                        <div
                                            ref={(element) => rowElements.set(entry.id, element)}
                                            class={`${styles.row}`
                                                + (entry.id === props.currentId ? ` ${styles.selected}` : '')
                                                + (entry.id === focusedEntry()?.id ? ` ${styles.focused}` : '')}
                                            onMouseEnter={(event) => {
                                                setHovered({ entry, element: event.currentTarget });
                                                setFocusIndex(flatEntries().findIndex(item => item.id === entry.id));
                                            }}
                                            onMouseLeave={() => setHovered(null)}
                                            onClick={() => props.onPick(entry.id)}
                                        >
                                            <span class={styles.rowName}>{entry.displayName}</span>
                                            <Show when={entry.type !== 'chat'}>
                                                <span class={styles.typeTag}>{entry.type}</span>
                                            </Show>
                                            <span class={styles.rowCaps}>
                                                <Show when={entry.config?.capabilities?.tools === true}><IconTools /></Show>
                                                <Show when={entry.config?.capabilities?.reasoning === true}><IconReasoning /></Show>
                                                <Show when={entry.config?.modalities?.input?.includes('image')}><IconVision /></Show>
                                            </span>
                                            <span class={styles.rowPrice}>{compactPriceText(entry, group.symbol)}</span>
                                        </div>
                                    )}
                                </For>
                            </>
                        )}
                    </For>
                    <Show when={flatEntries().length === 0}>
                        <div class={styles.empty}>没有匹配的模型</div>
                    </Show>
                </div>
            </div>

            <Show when={hovered()}>
                {(current) => {
                    const entry = () => current().entry;
                    const comparison = createMemo(() => compareSameModel(allEntries, entry()));
                    return (
                        <div ref={tipRef} class={styles.tip} style={tipStyle()}>
                            <div class={styles.tipTitle}>{entry().displayName}</div>
                            <div class={styles.tipSub}>
                                {[
                                    entry().provider,
                                    entry().type,
                                    contextText(entry().config?.limits?.maxContext)
                                        && `${contextText(entry().config?.limits?.maxContext)} 上下文`,
                                ].filter(Boolean).join(' · ')}
                            </div>
                            <div class={styles.tipSep} />
                            <div class={styles.tipPrice}>
                                <b>{fullPriceText(entry())}</b>
                                <span>每 1M · 输入 / 输出</span>
                            </div>
                            <Show when={capabilitiesOf(entry()).length > 0}>
                                <div class={styles.tipCaps}>
                                    <For each={capabilitiesOf(entry())}>
                                        {(cap) => <span class={styles.chip}>{cap}</span>}
                                    </For>
                                </div>
                            </Show>
                            <Show when={comparison().rows.length > 1}>
                                <div class={styles.tipSep} />
                                <div class={styles.compareTitle}>同款模型报价</div>
                                <For each={comparison().rows}>
                                    {(row) => (
                                        <div class={`${styles.compareLine}`
                                            + (row.provider === entry().provider ? ` ${styles.self}` : '')}>
                                            <span class={styles.compareProvider}>{row.provider}</span>
                                            <span>{fullPriceText(row)}</span>
                                        </div>
                                    )}
                                </For>
                                <Show when={comparison().rest > 0}>
                                    <div class={styles.compareTitle}>还有 {comparison().rest} 家</div>
                                </Show>
                            </Show>
                            <Show when={entry().baseUrl}>
                                <div class={styles.tipUrl}>{entry().baseUrl}</div>
                            </Show>
                        </div>
                    );
                }}
            </Show>
        </Portal>
    );
};

export default ModelPicker;
