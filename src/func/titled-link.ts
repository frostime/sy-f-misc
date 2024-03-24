import type FMiscPlugin from "@/index";
import { forwardProxy } from "@/api";


const getTitle = async (href) => {
    console.log(href);
    let title = null;
    if (href.startsWith("www.")) {
        href = "http://" + href;
    }
    if (href.startsWith("http")) {
        let data = await forwardProxy(
            href, 'GET', null,
            [{ 'User-Agent': "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.76" }],
            5000, 'text/html'
        );
        if (!data || (data.status / 100) !== 2) {
            return null;
        }
        let html = data?.body;
        let charsetReg = /<meta\b[^>]*charset=['"]?([^'"]*)['"]?[^>]*>/;
        //获取 html 的 dom 当中 head 内部的 title 标签的内容
        let titleReg = /<title\b[^>]*>(.*?)<\/title>/;
        let matchRes = html?.match(titleReg);
        if (matchRes) {
            title = matchRes[1];
            //@ts-ignore
            title = window.Lute.UnEscapeHTMLStr(title);
            matchRes = html?.match(charsetReg);
            let charset = matchRes ? matchRes[1] : "utf-8";
            if (charset.toLowerCase() !== "utf-8") {
                // title = iconv.decode(title, charset);
                title = null;
            }
        }
    }
    return title;
}


export const load = (plugin: FMiscPlugin) => {
    plugin.eventBus.on("open-menu-link", onOpenMenuLink);
    plugin.eventBus.on("click-blockicon", onClickBlockIcon);
}

export const unload = (plugin: FMiscPlugin) => {
    plugin.eventBus.off("open-menu-link", onOpenMenuLink);
    plugin.eventBus.off("click-blockicon", onClickBlockIcon);
}

async function onClickBlockIcon({ detail }) {
    let menu = detail.menu;
    let elements: HTMLElement[] = detail.blockElements;
    let protyle = detail.protyle;

    let hasAnchor = false;
    for (let ele of elements) {
        if (ele.querySelector("span[data-type=\"a\"]")) {
            hasAnchor = true;
            break;
        }
    }
    if (!hasAnchor) {
        return;
    }

    // console.log(element, protyle);
    menu.addItem({
        icon: "iconUrl",
        label: this.i18n.GetTitle,
        click: async () => {
            let spans = [];
            for (let ele of elements) {
                spans.push(...ele.querySelectorAll("span[data-type=\"a\"]"));
            }
            replaceHrefAnchor(protyle, ...spans);
        }
    });
}

async function onOpenMenuLink({ detail }) {
    // console.log(detail);
    let menu = detail.menu;
    let protyle = detail.protyle;
    const hrefSpan = detail.element;

    let dataHref = hrefSpan.getAttribute("data-href");
    if (!dataHref?.startsWith("http") && !dataHref?.startsWith("www.")) {
        return;
    }

    menu.addItem({
        icon: "iconUrl",
        label: this.i18n.GetTitle,
        click: async () => {
            replaceHrefAnchor(protyle, hrefSpan);
        }
    });
}

async function replaceHrefAnchor(protyle, ...elements: HTMLElement[]) {
    const updateProtyle = () => {
        let inputEvent = new Event("input");
        protyle.wysiwyg.element.dispatchEvent(inputEvent);
    };

    const replaceAnchor = async (element) => {
        let dataHref = element.getAttribute("data-href");
        let title = await getTitle(dataHref);
        console.log('Title:', title, '\n\t=>', dataHref);
        if (title) {
            element.innerText = title;
            element.setAttribute('data-title', title);
        }
        return
    }

    let allPromises = [];
    for (let element of elements) {
        allPromises.push(replaceAnchor(element));
    }
    await Promise.all(allPromises);
    updateProtyle();
}

