/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-07-01 20:20:57
 * @FilePath     : /src/func/bookmarks/libs/basic.ts
 * @LastEditTime : 2024-07-01 20:21:03
 * @Description  : 一些基础的数据结构操作
 */
/**
 * 将 arr[from] 元素移动到 arr[to]，返回更改后的 array
 * @param arr 原始数组
 * @param from from index
 * @param to to index
 * @returns 更改后的 array
 */
export const moveItem = <T>(arr: T[], from: number, to: number): T[] => {
    const newArr = [...arr];
    const item = newArr.splice(from, 1)[0];
    newArr.splice(to, 0, item);
    return newArr;
}

/**
 * 移除数组中指定索引的元素，返回更改后的 array
 * @param arr 原始数组
 * @param index 要移除的元素索引
 * @returns 更改后的 array
 */
export const rmItem = <T>(arr: T[], index: number): T[] => {
    const newArr = [...arr];
    newArr.splice(index, 1);
    return newArr;
}

/**
 * 在数组中插入元素，返回更改后的 array
 * @param arr 原始数组
 * @param item 要插入的元素
 * @param index 插入位置的索引，如果未提供则插入到数组末尾
 * @returns 更改后的 array
 */
export const insertItem = <T>(arr: T[], item: T, index?: number): T[] => {
    const newArr = [...arr];
    if (index !== undefined) {
        newArr.splice(index, 0, item);
    } else {
        newArr.push(item);
    }
    return newArr;
}
