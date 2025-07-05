import { createSignal, For } from 'solid-js';
import { solidDialog } from './dialog';
import { FormWrap, FormInput } from './components/Form';
import DialogAction from './components/dialog-action';


export const formDialog = (args: {
    title: string;
    formItems: {
        key: string;
        type: "checkbox" | "select" | "textinput" | "textarea" | "number" | "slider" | "button" | "hint";
        title: string;
        description?: string;
        defaultValue?: any;
        placeholder?: string;
        options?: Array<{ label: string; value: any }>;
        direction?: 'row' | 'column';
    }[];
    confirmCallback: (formData: Record<string, any>) => void;
    cancelCallback?: () => void;
    width?: string;
    height?: string;
    maxWidth?: string;
    maxHeight?: string;
    contentMaxHeight?: string;
    confirmLabel?: string;
    cancelLabel?: string;
}) => {
    const formDataSignals: Record<string, { get: () => any; set: (v: any) => void }> = {};

    args.formItems.forEach(item => {
        const [value, setValue] = createSignal(item.defaultValue);
        formDataSignals[item.key] = { get: value, set: setValue };
    });

    let dialogInstance: { close: () => void } | null = null;

    const handleConfirmInternal = () => {
        const result: Record<string, any> = {};
        for (const key in formDataSignals) {
            result[key] = formDataSignals[key].get();
        }
        args.confirmCallback(result);
        if (dialogInstance) {
            dialogInstance.close();
        }
    };

    const handleCancelInternal = () => {
        if (args.cancelCallback) {
            args.cancelCallback();
        }
        if (dialogInstance) {
            dialogInstance.close();
        }
    };

    const loader = () => {
        return (
            <>
                <div
                    class="b3-dialog__content"
                    style={{
                        "user-select": "none",
                        "padding-bottom": "10px",
                        "max-height": args.contentMaxHeight || "60vh",
                        "overflow-y": "auto"
                    }}
                >
                    <For each={args.formItems}>
                        {(item) => (
                            <FormWrap
                                title={item.title}
                                description={item.description}
                                direction={item.direction ?? 'column'}
                            >
                                <FormInput
                                    type={item.type}
                                    value={formDataSignals[item.key].get()}
                                    placeholder={item.placeholder}
                                    options={item.options ? Object.fromEntries(item.options.map(opt => [opt.value, opt.label])) : undefined}
                                    changed={(v) => formDataSignals[item.key].set(v)}
                                    style={{
                                        width: '100%',
                                        ...(item.direction === 'column' && { "margin-bottom": "8px" })
                                    }}
                                />
                            </FormWrap>
                        )}
                    </For>
                </div>
                <DialogAction // Corrected component name
                    onConfirm={handleConfirmInternal}
                    onCancel={handleCancelInternal}
                />
            </>
        );
    };

    dialogInstance = solidDialog({
        title: args.title,
        loader: loader,
        width: args.width,
        height: args.height,
        maxWidth: args.maxWidth,
        maxHeight: args.maxHeight,
        callback: () => {
            // Disposer is handled by solidDialog
        }
    });

    return dialogInstance;
};
