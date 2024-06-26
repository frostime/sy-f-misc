export class SettingItem {
    element: HTMLElement;
    item: ISettingItem;

    constructor(item: ISettingItem) {
        this.item = item;
        this.element = document.createElement('label');
        this.element.className = 'fn__flex b3-label';
        this.render();
    }

    private render() {
        this.element.innerHTML = `
            <div class="fn__flex-1">
                ${this.item.title}
                <div class="b3-label__text">${this.item.description || ''}</div>
            </div>
            <span class="fn__space"></span>
        `;

        let inputElement: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement;

        switch (this.item.type) {
            case 'checkbox':
                inputElement = document.createElement('input');
                inputElement.className = 'b3-switch fn__flex-center';
                inputElement.type = 'checkbox';
                inputElement.checked = this.item.value;
                break;
            case 'textinput':
                inputElement = document.createElement('input');
                inputElement.className = 'b3-text-field fn__flex-center fn__size200';
                inputElement.placeholder = this.item.placeholder || '';
                inputElement.value = this.item.value;
                break;
            case 'textarea':
                let textareaElement: HTMLTextAreaElement = document.createElement('textarea');
                textareaElement.className = "b3-text-field fn__block";
                textareaElement.style.resize = 'vertical';
                textareaElement.style.height = '10em';
                //不折行
                textareaElement.style.whiteSpace = 'nowrap';
                // textareaElement.style.fontSize = '120%';
                // textareaElement.style.fontFamily = 'var(--b3-font-family-code)';
                textareaElement.value = this.item.value;
                inputElement = textareaElement;
                this.element.style.flexDirection = 'column';
                let span = this.element.querySelector('span.fn__space') as HTMLElement;
                span.style.height = '8px';
                span.style.width = 'unset';
                break;
            case 'number':
                inputElement = document.createElement('input');
                inputElement.className = 'b3-text-field fn__flex-center fn__size200';
                inputElement.type = 'number';
                inputElement.value = this.item.value;
                break;
            case 'button':
                inputElement = document.createElement('button');
                inputElement.className = 'b3-button b3-button--outline fn__flex-center fn__size200';
                inputElement.textContent = this.item?.button?.label || this?.item.value || '';
                inputElement.onclick = this.item?.button?.callback || (() => { });
                break;
            case 'select':
                inputElement = document.createElement('select');
                inputElement.className = 'b3-select fn__flex-center fn__size200';
                Object.entries(this.item.options || {}).forEach(([value, text]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    inputElement.appendChild(option);
                });
                inputElement.value = this.item.value;
                break;
            case 'slider':
                inputElement = document.createElement('input');
                inputElement.className = 'b3-slider fn__size200 b3-tooltips b3-tooltips__s';
                inputElement.type = 'range';
                inputElement.min = String(this.item.slider?.min || 0);
                inputElement.max = String(this.item.slider?.max || 100);
                inputElement.step = String(this.item.slider?.step || 1);
                inputElement.value = this.item.value;
                inputElement.ariaLabel = this.item.value;
                inputElement.onchange = () => {
                    inputElement.ariaLabel = inputElement.value;
                }
                break;
        }

        if (inputElement) {
            inputElement.id = this.item.key;
            this.element.appendChild(inputElement);
        }
    }

    /*
     * 更新值
    */
    updateValue(value: any) {
        const inputElement: HTMLInputElement | HTMLSelectElement = this.element.querySelector('input, select, textarea');
        if (inputElement) {
            if (inputElement instanceof HTMLInputElement && inputElement.type === 'checkbox') {
                inputElement.checked = value;
            } else {
                inputElement.value = value;
            }
        }
    }

    bindChangedEvent(cb: (detail: KV) => void) {
        this.element.addEventListener('change', () => {
            const inputElement: HTMLInputElement | HTMLSelectElement = this.element.querySelector('input, select, textarea');
            if (inputElement) {
                let value: any;
                if (inputElement instanceof HTMLInputElement && inputElement.type === 'checkbox') {
                    value = inputElement.checked;
                } else {
                    value = inputElement.value;
                }
                cb({ key: this.item.key, value });
            }
        });
    }

    bindButtonClickEvent(cb: () => void) {
        if (this.item.type === 'button') {
            this.element.addEventListener('click', cb);
        }
    }
}

export class SettingPanel {
    element: HTMLElement;
    group: TKeyText;
    items: SettingItem[];
    display: boolean = false;

    constructor(group: TKeyText, items: SettingItem[] = []) {
        this.group = group;
        this.items = items;
        this.element = document.createElement('div');
        this.element.className = 'config__tab-container';
        this.element.dataset.name = group.key;
    }

    addItem(item: SettingItem) {
        this.items.push(item);
        // this.element.appendChild(item.element);
    }

    render() {
        this.element.innerHTML = '';
        this.items.forEach(item => {
            this.element.appendChild(item.element);
        });
        this.toggleDisplay();
    }

    /**
     * 导出json数据
     * @returns Object: { key: value }
     */
    dumpJson() {
        const setting = {};
        this.items.forEach(item => {
            setting[item.item.key] = item.item.value;
        });
        return setting;
    }

    /**
     * 更新值
     * @param setting {setting key: value}
     */
    updateValues(settings: { [key: string]: any }) {
        for (const key in settings) {
            this.items.forEach(item => {
                if (item.item.key === key) {
                    item.updateValue(settings[key]);
                }
            });
        }
    }

    toggleDisplay(display?: boolean) {
        this.display = display === undefined ? !this.display : display;
        this.element.classList.toggle('fn__none', this.display);
    }

    bindChangedEvent(cb: (detail: ChangeEvent) => void) {
        this.items.forEach(item => {
            item.bindChangedEvent(({ key, value }) => {
                cb({ group: this.group.key, key, value });
            });
        });
    }

    bindButtonClickEvent(cb: (detail: KV) => void) {
        this.items.forEach(item => {
            item.bindButtonClickEvent(() => {
                cb({ key: item.item.key, value: item.item.value });
            });
        });
    }
}

export class SettingGroupsPanel {
    element: HTMLElement;
    groups: TKeyText[];
    focusGroupKey: string;
    panels: SettingPanel[];

    constructor() {
        this.groups = [];
        this.focusGroupKey = '';
        this.panels = [];
        this.element = document.createElement('div');
        this.element.className = 'fn__flex-1 fn__flex config__panel';
    }

    addGroup(group: TKeyText, items: ISettingItem[]) {
        this.groups.push(group);
        const panel = new SettingPanel(group, items.map(item => new SettingItem(item)));
        panel.render();
        this.panels.push(panel);
    }

    addGroupPanel(panel: SettingPanel) {
        this.groups.push(panel.group);
        this.panels.push(panel);
    }

    render() {
        this.focusGroupKey = this.focusGroupKey || this.groups[0].key;
        this.element.innerHTML = `
            <ul class="b3-tab-bar b3-list b3-list--background">
                ${this.groups.map(group => `
                    <li class="b3-list-item${group.key === this.focusGroupKey ? ' b3-list-item--focus' : ''}" data-name="${group.key}">
                        <span class="b3-list-item__text">${group.text}</span>
                    </li>
                `).join('')}
            </ul>
            <div class="config__tab-wrap"></div>
        `;

        const tabWrap = this.element.querySelector('.config__tab-wrap');
        if (tabWrap) {
            this.panels.forEach(panel => {
                tabWrap.appendChild(panel.element);
            });
        }

        const tabItems = this.element.querySelectorAll('.b3-list-item');
        tabItems.forEach(item => {
            item.addEventListener('click', () => {
                // @ts-ignore
                this.displayGroup(item.dataset.name || '');
            });
        });

        this.displayGroup(this.focusGroupKey);
    }

    /**
     * 更新值
     * @param groupKey 
     * @param settings {setting key: value}
     */
    updateValues(groupKey: string, settings: { [key: string]: any }) {
        this.panels.forEach(panel => {
            if (panel.group.key === groupKey) {
                panel.updateValues(settings);
            }
        });
    }

    displayGroup(groupKey: string) {
        this.focusGroupKey = groupKey;
        const tabItems = this.element.querySelectorAll('li.b3-list-item');
        tabItems.forEach(item => {
            // @ts-ignore
            item.classList.toggle('b3-list-item--focus', item.dataset.name === groupKey);
        });

        this.panels.forEach(panel => {
            panel.display = panel.group.key === groupKey;
            panel.toggleDisplay();
        });
    }

    bindChangedEvent(cb: (detail: ChangeEvent) => void) {
        this.panels.forEach(panel => {
            panel.bindChangedEvent(cb);
        });
    }

    bindButtonClickEvent(cb: (detail: KV) => void) {
        this.panels.forEach(panel => {
            panel.bindButtonClickEvent(cb);
        });
    }
}
