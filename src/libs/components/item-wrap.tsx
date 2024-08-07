// Copyright (c) 2024 by frostime. All Rights Reserved.
// Author       : frostime
// Date         : 2024-06-01 20:03:50
// FilePath     : /src/libs/setting-item-wrap.tsx
// LastEditTime : 2024-06-07 19:14:28
// Description  : The setting item container

import { children, Component, JSX } from "solid-js";

interface SettingItemWrapProps {
    title: string;
    description: string;
    direction?: 'row' | 'column';
    children?: JSX.Element;
}

const SettingItemWrap: Component<SettingItemWrapProps> = (props) => {

    const c = children(() => props.children);

    return (
        <>
            {props.direction === "row" ? (
                <div class="item-wrap b3-label" style={{
                    "box-shadow": "unset",
                    "padding-bottom": "16px",
                    "margin-bottom": "16px",
                    "border-bottom": "1px solid var(--b3-border-color)"
                }}>
                    <div class="fn__block">
                        <span class="title" style={{
                            "font-weight": "bold",
                            "color": "var(--b3-theme-primary)"
                        }}>{props.title}</span>
                        <div class="b3-label__text" innerHTML={props.description}></div>
                        <div class="fn__hr"></div>
                        <div style="display: flex; flex-direction: column; gap: 5px; position: relative;">
                            {c()}
                        </div>
                    </div>
                </div>
            ) : (
                <div class="item-wrap fn__flex b3-label config__item" style={{
                    "box-shadow": "unset",
                    "padding-bottom": "16px",
                    "margin-bottom": "16px",
                    "border-bottom": "1px solid var(--b3-border-color)",
                    "position": "relative"
                }}>
                    <div class="fn__flex-1">
                        <span class="title" style={{
                            "font-weight": "bold",
                            "color": "var(--b3-theme-primary)"
                        }}>{props.title}</span>
                        <div class="b3-label__text" innerHTML={props.description}></div>
                    </div>
                    <span class="fn__space" />
                    {c()}
                </div>
            )}
        </>
    );
};

export default SettingItemWrap;
