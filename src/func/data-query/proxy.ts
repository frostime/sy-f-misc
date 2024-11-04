import { renderAttr } from "./components";

/**
 * 为 Block 添加一些辅助属性，便于直接使用
 * @param block 
 * @returns 
 */
export const wrapBlock = (block: Block | any) => {
    let proxy = new Proxy(block, {
        get(target: Block, prop: keyof Block | string) {
            if (prop in target) {
                return target[prop];
            }
            //增加一些方便的属性和方法
            switch (prop) {
                case 'unwrap':
                    return () => target;
                case 'unwrapped':
                    return target;
                case 'aslink':
                case 'tolink':
                    return `[${block.fcontent || block.content}](siyuan://blocks/${block.id})`
                case 'asref':
                case 'toref':
                    return `((${block.id} '${block.fcontent || block.content}'))`
                case 'attr':
                    return (attr: keyof Block, renderer?: (block: Block, attr: keyof Block) => string | null) => {
                        let ans: string;
                        if (renderer) {
                            ans = renderer(block, attr);
                        }
                        return ans ?? renderAttr(block, attr);
                    }
                case 'updatedDate':
                    return renderAttr(block, 'updated', { onlyDate: true });
                case 'createdDate':
                    return renderAttr(block, 'created', { onlyDate: true });
                case 'updatedTime':
                    return renderAttr(block, 'updated', { onlyTime: true });
                case 'createdTime':
                    return renderAttr(block, 'created', { onlyTime: true });
                case 'updatedDatetime':
                    return renderAttr(block, 'updated');
                case 'createdDatetime':
                    return renderAttr(block, 'created');
            }
            if (prop.startsWith('custom-')) {
                let ial = block.ial;
                // ial 格式 `{: id="20231218144345-izn0eer" custom-a="aa" }`
                let pattern = new RegExp(`${prop}=\"(.*?)\"`);
                let match = ial.match(pattern);
                if (match) {
                    return match[1];
                } else {
                    return "";
                }
            }
            return null;
        }
    });
    return proxy;
}


/**
 * 将 SQL 查询结果的列表添加一层 Proxy，以 attach 上层一些方便的方法
 * @param list 
 * @returns 
 */
export const wrapList = (list: (Partial<Block> | any)[], useWrapBlock: boolean = true) => {
    // let wrappedBlocks = list.map(block => wrapBlock(block as Block));
    list = useWrapBlock ? list.map(block => wrapBlock(block as Block)) : list;

    return new Proxy(list, {
        get(target: Block[], prop: any) {
            if (prop in target) {
                return Reflect.get(target, prop);
            }
            switch (prop) {
                case 'unwrap':
                    return () => target;
                case 'unwrapped':
                    return target;
                case 'pick':
                    return (...attrs: (keyof Block)[]) => {
                        if (attrs.length === 1) {
                            let picked = target.map(b => b[attrs[0]]);
                            return wrapList(picked, false);
                        } else {
                            let picked = target.map(block => {
                                let obj: any = {};
                                attrs.forEach(attr => {
                                    obj[attr] = block[attr] ?? null;
                                });
                                return obj;
                            });
                            return wrapList(picked);
                        }
                    }
                case 'sorton':
                    return (attr: keyof Block, order: 'asc' | 'desc' = 'asc') => {
                        let sorted = target.sort((a, b) => {
                            if (a[attr] > b[attr]) {
                                return order === 'asc' ? 1 : -1;
                            } else if (a[attr] < b[attr]) {
                                return order === 'asc' ? -1 : 1;
                            } else {
                                return 0;
                            }
                        });
                        // return sorted;
                        return wrapList(sorted);
                    }
                case 'groupby':
                    return (predicate: (keyof Block) | ((b: Partial<Block>) => any)) => {
                        const maps = {};
                        const getKey = (b: Partial<Block>) => {
                            if (typeof predicate === 'function') {
                                return predicate(b);
                            } else {
                                return b[predicate];
                            }
                        };
                        target.forEach(block => {
                            const key = getKey(block);
                            if (!(key in maps)) {
                                maps[key] = wrapList([]);
                            }
                            maps[key].push(block);
                        });
                        return maps;
                    }
                case 'groupbyfn':
                        return (fn: (b: Partial<Block>) => any) => {
                            const maps = {};
                            target.forEach(block => {
                                const key = fn(block);
                                if (!(key in maps)) {
                                    maps[key] = wrapList([]);
                                }
                                maps[key].push(block);
                            });
                            return maps;
                        }
                case 'divide':
                    return (predicate: (block: Block, index?: number) => boolean) => {
                        let matched = target.filter(block => predicate(block));
                        let unmatched = target.filter(block => !predicate(block));
                        // return [matched, unmatched];
                        return [wrapList(matched), wrapList(unmatched)];
                    }
            };
            return null;
        }
    });
}
