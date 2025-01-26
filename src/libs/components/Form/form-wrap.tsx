// Copyright (c) 2024 by frostime. All Rights Reserved.
// Author       : frostime
// Date         : 2024-06-01 20:03:50
// FilePath     : /src/libs/setting-item-wrap.tsx
// LastEditTime : 2024-06-07 19:14:28
// Description  : The setting item container

import { children, Component, createMemo, JSX } from "solid-js";

import css from './form-wrap.module.css';

interface IFormWrap {
    title: string;
    description: string;
    direction?: 'row' | 'column';
    children?: JSX.Element;
    style?: JSX.CSSProperties;
    action?: JSX.Element;
}

const FormWrap: Component<IFormWrap> = (props) => {

    const C = children(() => props.children);

    const A = createMemo(() => props.action);

    const attrStyle = createMemo(() => {
        let styles = {};
        if (props.direction === 'column') {
            styles = { position: 'relative' };
        }
        let propstyle = props.style ?? {};
        styles = { ...styles, ...propstyle };
        return {
            style: styles
        };
    });

    return (
        <>
            {props.direction === "row" ? (
                <div class={`${css['item-wrap']} b3-label`} {...attrStyle()}>
                    <div class="fn__block">
                        <div style="display: flex; align-items: center;">
                            <div class="fn__flex-1">
                                <span class={css.title}>{props.title}</span>
                                <div class="b3-label__text" innerHTML={props.description}></div>
                            </div>
                            <div>{A()}</div>
                        </div>
                        <div class="fn__hr"></div>
                        <div style="display: flex; flex-direction: column; gap: 5px; position: relative;">
                            {C()}
                        </div>
                    </div>
                </div>
            ) : (
                <div class={`${css['item-wrap']} fn__flex b3-label config__item`} {...attrStyle()}>
                    <div class="fn__flex-1">
                        <span class={css.title}>{props.title}</span>
                        <div class="b3-label__text" innerHTML={props.description}></div>
                    </div>
                    <span class="fn__space" />
                    {C()}
                </div>
            )}
        </>
    );
};

export default FormWrap;
