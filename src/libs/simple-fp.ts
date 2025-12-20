/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-20 20:38:53
 * @Description  : 
 * @FilePath     : /src/libs/simple-fp.ts
 * @LastEditTime : 2025-12-20 21:56:33
 */
/**
 * Result<T, E> - 类型安全的 Result Monad
 * 
 * Result 类直接实现 ResultData 的结构，可以：
 * 1. 直接访问 .ok, .data, .error 属性（符合直觉）
 * 2. 使用函数式方法如 map, flatMap（链式调用）
 * 3. 序列化后仍可作为普通对象使用（跨 iframe 通信）
 */
export type ResultData<T, E = string> =
    | { ok: true; data: T; error?: undefined; extra?: Record<string, any> }
    | { ok: false; error: E; data?: undefined; extra?: Record<string, any> };

/**
 * Result 类的结构与 ResultData 完全兼容
 * 可以直接当作 ResultData 使用，也可以使用函数式方法
 * 
 * 使用泛型参数 OK 来精确控制 ok 属性的字面量类型
 */
export class Result<T, E = string, OK extends boolean = boolean> {
    readonly ok!: OK;
    readonly data!: OK extends true ? T : never;
    readonly error!: OK extends false ? E : never;
    readonly extra?: Record<string, any>;

    private constructor(result: ResultData<T, E>) {
        this.ok = result.ok as OK;
        this.data = result.data as any;
        this.error = result.error as any;
        this.extra = result.extra;
    }

    static ok<T, E = string>(data: T, extra?: Record<string, any>): Result<T, E, true> {
        return new Result({ ok: true, data, extra }) as Result<T, E, true>;
    }

    static err<T = never, E = string>(error: E, extra?: Record<string, any>): Result<T, E, false> {
        return new Result({ ok: false, error, extra }) as Result<T, E, false>;
    }

    isOk(): this is Result<T, E, true> & { ok: true; data: T; error?: undefined } {
        return this.ok === true;
    }

    isErr(): this is Result<T, E, false> & { ok: false; error: E; data?: undefined } {
        return this.ok === false;
    }

    map<U>(fn: (data: T) => U): Result<U, E, OK> {
        if (this.ok) {
            return Result.ok(fn(this.data as T), this.extra) as Result<U, E, OK>;
        }
        return Result.err(this.error as E, this.extra) as Result<U, E, OK>;
    }

    flatMap<U>(fn: (data: T) => Result<U, E, any>): Result<U, E, boolean> {
        if (this.ok) {
            return fn(this.data as T);
        }
        return Result.err(this.error as E, this.extra);
    }

    mapError<F>(fn: (error: E) => F): Result<T, F, OK> {
        if (this.ok) {
            return Result.ok(this.data as T, this.extra) as Result<T, F, OK>;
        }
        return Result.err(fn(this.error as E), this.extra) as Result<T, F, OK>;
    }

    unwrap(): T {
        if (!this.ok) {
            throw new Error(`Unwrap failed: ${JSON.stringify(this.error)}`);
        }
        return this.data as T;
    }

    unwrapOr(defaultValue: T): T {
        return this.ok ? (this.data as T) : defaultValue;
    }

    match<U>(handlers: { ok: (data: T) => U; err: (error: E) => U }): U {
        if (this.ok) {
            return handlers.ok(this.data as T);
        }
        return handlers.err(this.error as E);
    }

    /**
     * @deprecated Result 现在直接实现 ResultData 接口，无需调用此方法
     * 直接使用 result.ok, result.data, result.error 即可
     */
    unwrapData(): ResultData<T, E> {
        return {
            ok: this.ok,
            data: this.data,
            error: this.error,
            extra: this.extra
        } as ResultData<T, E>;
    }

    static async fromPromise<T, E = Error>(promise: Promise<T>): Promise<Result<T, E, boolean>> {
        try {
            return Result.ok(await promise);
        } catch (error) {
            return Result.err(error as E);
        }
    }

    static fromThrowable<T, E = Error>(fn: () => T): Result<T, E, boolean> {
        try {
            return Result.ok(fn());
        } catch (error) {
            return Result.err(error as E);
        }
    }
}

export class Maybe<T> {
    private constructor(private readonly value: T | null) { }

    static some<T>(value: T): Maybe<T> {
        return new Maybe(value);
    }

    static none<T>(): Maybe<T> {
        return new Maybe<T>(null);
    }

    map<U>(fn: (value: T) => U): Maybe<U> {
        return this.value !== null
            ? Maybe.some(fn(this.value))
            : Maybe.none();
    }

    flatMap<U>(fn: (value: T) => Maybe<U>): Maybe<U> {
        return this.value !== null
            ? fn(this.value)
            : Maybe.none();
    }
}

export const ok = Result.ok.bind(Result);
export const err = Result.err.bind(Result);

/**
 * tryCatch - 自动捕获异常并返回 Result
 */
export function tryCatch<T, E = Error>(
    fn: () => T,
    onError?: (error: unknown) => E
): Result<T, E> {
    try {
        return ok(fn());
    } catch (error) {
        return err(onError ? onError(error) : error as E);
    }
}

/**
 * tryCatchAsync - 异步版本
 */
export async function tryCatchAsync<T, E = Error>(
    fn: () => Promise<T>,
    onError?: (error: unknown) => E
): Promise<Result<T, E>> {
    try {
        return ok(await fn());
    } catch (error) {
        return err(onError ? onError(error) : error as E);
    }
}

/**
 * flatMap - 函数版本
 */
export function flatMap<T, U, E>(
    fn: (data: T) => Result<U, E>
): (result: Result<T, E>) => Result<U, E> {
    return (result) => result.flatMap(fn);
}


/**
 * pipe - 组合多个操作
 */
export function pipe<T, E>(
    ...fns: Array<(result: any) => any>
): (result: Result<T, E>) => any {
    return (result) => fns.reduce((acc, fn) => fn(acc), result);
}

