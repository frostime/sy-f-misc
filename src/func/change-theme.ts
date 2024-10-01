import { Menu, getFrontend } from "siyuan";
import { request, getInstalledTheme, getBazaarTheme } from "@/api";
// import { Svg } from "@/utils/const";

import type FMiscPlugin from "@/index";

const SIYUAN = window.siyuan;
const Lang = SIYUAN.config.lang;


class Themes {
    name2displayName: { [key: string]: string } = {};

    async updateThemes(packages?: any) {
        this.name2displayName = {};

        if (!packages) {
            let frontend = getFrontend();
            packages = (await getInstalledTheme(frontend)).packages;
        }
        for (let pkg of packages) {
            let displayName = pkg.displayName[Lang];
            if (displayName === undefined || displayName === null || displayName === '') {
                displayName = pkg.displayName['default'];
            }
            // console.debug(pkg.displayName)
            this.name2displayName[pkg.name] = displayName;
        }
    }

    getDisplayName(name: string) {
        let displayName = this.name2displayName[name];
        if (displayName === undefined || displayName === null || displayName === '') {
            displayName = name;
        }
        return displayName;
    }
}

let themes: Themes;
// let bazzarThemes: ITheme[] = [];


export let name = 'ChangeTheme';
export let enabled = false;

export function load(plugin: FMiscPlugin) {

    if (enabled) return;

    themes = new Themes();
    getBazaarTheme().then((data) => {
        // bazzarThemes = data ?? [];
        themes.updateThemes(data);
    });

    plugin.eb.on('on-topbar-menu', showThemesMenu);

    enabled = true;
}

export function unload(plugin: FMiscPlugin) {
    if (!enabled) return;
    plugin.eb.off('on-topbar-menu', showThemesMenu);
    enabled = false;
}

function showThemesMenu(menu: Menu) {
    // let menu: Menu = new Menu("ThemeChange");
    const appearance = SIYUAN.config.appearance;
    const mode = appearance.mode === 0 ? 'light' : 'dark';
    const themesList: { name: string, label: string }[] = mode === 'light' ? appearance.lightThemes : appearance.darkThemes;
    const current: string = mode === 'light' ? appearance.themeLight : appearance.themeDark;

    const submenu = [];
    for (const theme of themesList) {
        let icon = null;
        if (theme.name === current) {
            icon = 'iconSelect';
        }
        submenu.push({
            label: theme.label,
            icon: icon,
            click: () => {
                useTheme(theme.name, mode);
            }
        });
    }

    menu.addItem({
        label: '更换主题',
        icon: 'iconTheme',
        type: 'submenu',
        submenu: submenu
    });
}

function useTheme(themeName: string, mode: string) {
    const appearance = SIYUAN.config.appearance;
    const current = mode === 'light' ? appearance.themeLight : appearance.themeDark;
    if (themeName === current) {
        return;
    }
    const obj = {
        ...SIYUAN.config.appearance,
    };
    if (mode === 'light') {
        obj.themeLight = themeName;
    } else {
        obj.themeDark = themeName;
    }
    request('/api/setting/setAppearance', obj).then(() => window.location.reload());
}

// function random(mode: string) {
//     const appearance = SIYUAN.config.appearance;
//     const current = mode === 'light' ? appearance.themeLight : appearance.themeDark;
//     const themes = mode === 'light' ? [...appearance.lightThemes] : [...appearance.darkThemes];
//     for (let i = 0; i < themes.length; i++) {
//         if (themes[i] === current) {
//             themes.splice(i, 1);
//         }
//     }
//     if (themes.length === 0) {
//         return;
//     }
//     const r = Math.floor(Math.random() * themes.length)
//     useTheme(themes[r], mode);
// }
