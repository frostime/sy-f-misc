import type FMiscPlugin from "@/index";
import { forwardProxy } from "@/api";

const IconUrl = `
<symbol id="iconUrl" viewBox="0 0 1024 1024"><path d="M578.133 675.627c-3.306-3.307-8.746-3.307-12.053 0L442.133 799.573c-57.386 57.387-154.24 63.467-217.6 0-63.466-63.466-57.386-160.213 0-217.6L348.48 458.027c3.307-3.307 3.307-8.747 0-12.054l-42.453-42.453c-3.307-3.307-8.747-3.307-12.054 0L170.027 527.467c-90.24 90.24-90.24 236.266 0 326.4s236.266 90.24 326.4 0L620.373 729.92c3.307-3.307 3.307-8.747 0-12.053l-42.24-42.24z m275.84-505.6c-90.24-90.24-236.266-90.24-326.4 0L403.52 293.973c-3.307 3.307-3.307 8.747 0 12.054l42.347 42.346c3.306 3.307 8.746 3.307 12.053 0l123.947-123.946c57.386-57.387 154.24-63.467 217.6 0 63.466 63.466 57.386 160.213 0 217.6L675.52 565.973c-3.307 3.307-3.307 8.747 0 12.054l42.453 42.453c3.307 3.307 8.747 3.307 12.054 0l123.946-123.947c90.134-90.24 90.134-236.266 0-326.506z"></path><path d="M616.64 362.987c-3.307-3.307-8.747-3.307-12.053 0l-241.6 241.493c-3.307 3.307-3.307 8.747 0 12.053l42.24 42.24c3.306 3.307 8.746 3.307 12.053 0L658.773 417.28c3.307-3.307 3.307-8.747 0-12.053l-42.133-42.24z"></path>
</symbol>
`;

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

export let name = 'TitledLink';
export let enabled = false;

export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    plugin.addIcons(IconUrl);
    plugin.eventBus.on("open-menu-link", onOpenMenuLink);
    plugin.eventBus.on("click-blockicon", onClickBlockIcon);
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    plugin.eventBus.off("open-menu-link", onOpenMenuLink);
    plugin.eventBus.off("click-blockicon", onClickBlockIcon);
    enabled = false;
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
        label: '获取标题',
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
        label: '获取标题',
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

