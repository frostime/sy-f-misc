/*
 * Copyright (c) 2024 by zxhd863943427, frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-05-08 15:00:37
 * @FilePath     : /src/func/data-query.ts
 * @LastEditTime : 2024-05-08 15:14:15
 * @Description  :
 *      - Fork from project https://github.com/zxhd863943427/siyuan-plugin-data-query
 *      - 基于该项目的 v0.0.7 版本进行修改
 */
// import type FMiscPlugin from "@/index";
import {
    IProtyle,
    fetchSyncPost,
    Lute
} from "siyuan";
import { ILute, setLute } from "@/utils/lute";

let lute: ILute = null;

export class DataView {
    private protyle: IProtyle
    private item: HTMLElement
    private top: number | null
    private lute: Lute
    container: HTMLElement

    constructor(protyle: IProtyle, item: HTMLElement, top: number | null) {
        this.protyle = protyle
        this.item = item
        this.top = top
        this.container = document.createElement("div")
        this.container.classList.add('data-query-embed')
        this.item.lastElementChild.insertAdjacentElement("beforebegin", this.container);
        this.lute = lute
    }

    addElement(CustomEmbed: HTMLElement | string) {
        const customElem = document.createElement("div")

        if (typeof CustomEmbed === 'string') {
            const html = `<div class="protyle-wysiwyg__embed">${CustomEmbed}</div>`
            customElem.innerHTML = html
        }
        else if (CustomEmbed instanceof Element) {
            customElem.appendChild(CustomEmbed)
        }

        this.container.append(customElem)
    }

    addMarkdown(md: string) {
        let elem = document.createElement("div")
        elem.innerHTML = this.lute.Md2BlockDOM(md)
        this.container.append(elem)
    }

    list(data: any[]) {
        let listContainer = document.createElement("div")
        new List({
            target: listContainer,
            props: {
                // we'll learn about props later
                dataList: data
            }
        })
        this.container.append(listContainer)
    }

    card(data: any[]) {
        let cardContainer = document.createElement('div')
        new Card({
            target: cardContainer,
            props: {
                data: data
            }
        })
        this.container.append(cardContainer)
    }
    table(data: any[]) {
        let tableContainer = document.createElement('div')
        new Table({
            target: tableContainer,
            props: {
                tableData: data
            }
        })
        this.container.append(tableContainer)
    }

    show() {

        this.protyle.element.addEventListener("keydown", cancelKeyEvent, true)
        const rotateElement = this.item.querySelector(".fn__rotate");

        if (rotateElement) {
            rotateElement.classList.remove("fn__rotate");
        }

        this.container.setAttribute("contenteditable", "false")
        this.container.onmousedown = (el) => { el.stopPropagation() }
        this.container.onmouseup = (el) => { el.stopPropagation() }
        this.container.onkeydown = (el) => { el.stopPropagation() }
        this.container.onkeyup = (el) => { el.stopPropagation() }
        this.container.oninput = (el) => { el.stopPropagation() }
        this.container.onclick = (el) => {
            const selection = window.getSelection();
            const length = selection.toString().length;
            if (length === 0 && (el.target as HTMLElement).tagName === "SPAN") {
                return
            }
            el.stopPropagation()
        }

        if (this.top) {
            // 前进后退定位 https://ld246.com/article/1667652729995
            this.protyle.contentElement.scrollTop = this.top;
        }

        // 确保内部节点不可编辑
        let editableNodeList = this.container.querySelectorAll('[contenteditable="true"]')
        editableNodeList.forEach(node => {
            node.setAttribute('contenteditable', 'false')
        })

        this.item.style.height = "";
        let content = lute.BlockDOM2Content(this.container.innerText).replaceAll('\n', ' ')
        fetchSyncPost('/api/search/updateEmbedBlock', {
            id: this.item.getAttribute("data-node-id"),
            content: content
        })
    }
}


function cancelKeyEvent(el: KeyboardEvent) {
    let nodeElement: HTMLElement = document.getSelection().getRangeAt(0).startContainer.parentElement
    if (hasParentWithClass(nodeElement, "data-query-embed")) {
        el.stopPropagation()
    }
}



function hasParentWithClass(element: HTMLElement, className: string) {

    // 获取父元素
    let parent = element.parentElement;

    // 通过while循环遍历父元素
    while (parent && !parent.classList.contains('protyle-wysiwyg--attr')) {

        // 检查父元素是否包含指定class
        if (parent.classList.contains(className)) {
            return true;
        }

        // 继续向上获取父元素
        parent = parent.parentElement;
    }

    return false;
}

export let name = "DataQuery";
export let enabled = false;

export const load = () => {
    if (enabled) return;
    lute = setLute({});
    enabled = true;
}

export const unload = () => {
    if (!enabled) return;
    lute = null;
    enabled = false;
}
