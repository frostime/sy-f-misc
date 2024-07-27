import { children, JSXElement } from 'solid-js';
import { Portal } from 'solid-js/web';

interface ModalProps {
    title: string;
    children?: JSXElement
}

const Modal = (props: ModalProps) => {
    const useChildren = children(() => props.children);

    return (

        <Portal>
            <div class="protyle-util" style="padding: 0px; z-index: 77; top: 371.2px; left: 590.7px; user-select: auto;">
                <div data-drag="true">
                    <div class="block__icons block__icons--menu fn__flex" style="border-radius: var(--b3-border-radius-b) var(--b3-border-radius-b) 0 0;">
                        <span class="fn__flex-1 resize__move">
                            {props.title}
                        </span>
                        <span class="fn__space"></span>
                        <button data-type="pin" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="钉住">
                            <svg><use href="#iconPin"></use></svg>
                        </button>
                        <span class="fn__space"></span>
                        <button data-type="close" class="block__icon block__icon--show b3-tooltips b3-tooltips__nw" aria-label="关闭">
                            <svg style="width: 10px"><use href="#iconClose"></use></svg>
                        </button>
                    </div>
                    {useChildren()}
                </div>
            </div>
        </Portal>
    );
};
