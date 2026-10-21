// SiYuan UI boundary for the isolated WebView lifecycle tests.
interface TabModel { element: HTMLElement }
interface TabRegistration {
    type: string;
    init(this: TabModel): void;
    beforeDestroy(this: TabModel): void;
}

export const platform = {
    frontend: 'desktop',
    messages: [] as string[],
    tabs: new Map<string, TabRegistration>(),
    openedTabIds: [] as string[],
    dialogs: [] as Array<{ container: HTMLElement; closed: boolean; close: () => void }>,
};

export const thisPlugin = () => ({
    name: 'sy-f-misc',
    app: {},
    addTab(options: TabRegistration) { platform.tabs.set(options.type, options); }
});

export const getFrontend = () => platform.frontend;
export const showMessage = (message: string) => { platform.messages.push(message); };

export const openTab = (options: { custom: { id: string } }) => {
    platform.openedTabIds.push(options.custom.id);
};

export const simpleDialog = (options: { ele: HTMLElement; callback: () => void }) => {
    const container = document.createElement('div');
    container.appendChild(options.ele);
    const dialog = {
        container,
        closed: false,
        close: () => {
            if (dialog.closed) return;
            dialog.closed = true;
            options.callback();
            container.remove();
        }
    };
    platform.dialogs.push(dialog);
    return dialog;
};
