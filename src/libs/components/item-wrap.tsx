// Copyright (c) 2024 by frostime. All Rights Reserved.
// Author       : frostime
// Date         : 2024-06-01 20:03:50
// FilePath     : /src/libs/setting-item-wrap.tsx
// LastEditTime : 2024-06-07 19:14:28
// Description  : The setting item container

import { Component, JSX } from "solid-js";

interface SettingItemWrapProps {
    title: string;
    description: string;
    direction?: 'row' | 'column';
    children?: JSX.Element;
}

const SettingItemWrap: Component<SettingItemWrapProps> = (props) => {
    const { title, description, direction = 'column' } = props;

    return (
        <>
            {direction === "row" ? (
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
                        }}>{title}</span>
                        <div class="b3-label__text" innerHTML={description}></div>
                        <div class="fn__hr"></div>
                        {props?.children}
                    </div>
                </div>
            ) : (
                <div class="item-wrap fn__flex b3-label config__item" style={{
                    "box-shadow": "unset",
                    "padding-bottom": "16px",
                    "margin-bottom": "16px",
                    "border-bottom": "1px solid var(--b3-border-color)",
                }}>
                    <div class="fn__flex-1">
                        <span class="title" style={{
                            "font-weight": "bold",
                            "color": "var(--b3-theme-primary)"
                        }}>{title}</span>
                        <div class="b3-label__text" innerHTML={description}></div>
                    </div>
                    <span class="fn__space" />
                    {props?.children}
                </div>
            )}
        </>
    );
};

export default SettingItemWrap;
