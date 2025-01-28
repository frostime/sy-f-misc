/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-25 14:19:10
 * @FilePath     : /src/libs/components/Elements/Markdown.tsx
 * @LastEditTime : 2025-01-28 20:47:35
 * @Description  : 
 */

import { getLute } from "@frostime/siyuan-plugin-kits";
import { createMemo } from "solid-js";


const Markdown = (props: {
    markdown: string;
    fontSize?: string;
}) => {
    const lute = getLute();
    let content = createMemo(() => {
        //@ts-ignore
        return lute.Md2HTML(props.markdown);
    });
    let font = () => props.fontSize ? `${props.fontSize} !important;` : 'initial';
    return (
        <div
            class="item__readme b3-typography"
            innerHTML={content()}
            style={`font-size: ${font()}`}
        />
    );
}

export default Markdown;
