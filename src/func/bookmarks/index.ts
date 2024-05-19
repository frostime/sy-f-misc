import type FMiscPlugin from "@/index";
import { template } from "./component";
import { html2ele } from "@/utils";

export let name = "CustomBookmark";
export let enabled = false;
export const load = (plugin: FMiscPlugin) => {
    if (enabled) return;
    plugin.addDock({
        type: '::dock::' + 'Bookmark',
        config: {
            position: 'RightBottom',
            size: {
                width: 200,
                height: 200,
            },
            icon: 'iconEmoji',
            title: 'F-Bookmark'
        },
        data: {
            plugin: plugin,
        },
        init() {
            let frag = html2ele(template);
            this.element.appendChild(frag);
        }
    })
    enabled = true;
}

export const unload = (plugin: FMiscPlugin) => {
    if (!enabled) return;
    
    enabled = false;
}