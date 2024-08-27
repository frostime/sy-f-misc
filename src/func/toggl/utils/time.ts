/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-08-27 15:31:05
 * @FilePath     : /src/func/toggl/utils/time.ts
 * @LastEditTime : 2024-08-27 17:43:23
 * @Description  : 
 */
export const startOfToday = (): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // 设置时间为当天的开始时间
    return today.getTime() / 1000;
}

export const toRfc3339 = (time: number | Date) => {
    const date = new Date(time);
    if (isNaN(date.getTime())) {
        throw new Error("Invalid time input");
    }
    return date.toISOString();
}

export const fromRfc3339 = (rfc3339String: string) => {
    const date = new Date(rfc3339String);
    return date;
}

export const formatDate = (date?: Date, sep=''): string => {
    date = date === undefined ? new Date() : date;
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    return `${year}${sep}${month < 10 ? '0' + month : month}${sep}${day < 10 ? '0' + day : day}`;
}

export const formatSeconds = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds_ = seconds % 60;
    return `${hours}:${minutes < 10 ? '0' + minutes : minutes}:${seconds_ < 10 ? '0' + seconds_ : seconds_}`;
}
