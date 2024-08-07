import { Component } from "solid-js";

interface IDialogActionsProps {
    onConfirm: () => void;
    onCancel: () => void;
}

const DialogAction: Component<IDialogActionsProps> = (props) => {

    return (
        <div class="b3-dialog__action">
            <button class="b3-button b3-button--cancel" onClick={props.onCancel}>
                {window.siyuan.languages.cancel}
            </button>
            <div class="fn__space"></div>
            <button
                class="b3-button b3-button--text"
                id="confirmDialogConfirmBtn"
                onClick={props.onConfirm}
            >
                {window.siyuan.languages.confirm}
            </button>
        </div>
    );
};

export default DialogAction;
