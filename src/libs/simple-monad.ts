/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-20 20:38:53
 * @Description  : 
 * @FilePath     : /src/libs/simple-monad.ts
 * @LastEditTime : 2025-12-20 20:57:14
 */
/**
 * Result<T, E> - 类型安全的 Result Monad
 */
export type ResultData<T, E = string> =
    | { ok: true; data: T; extra?: Record<string, any> }
    | { ok: false; error: E; extra?: Record<string, any> };

export class Result<T, E = string> {
    private constructor(private readonly result: ResultData<T, E>) { }

    static ok<T, E = string>(data: T, extra?: Record<string, any>): Result<T, E> {
        return new Result({ ok: true, data, extra });
    }

    static err<T = never, E = string>(error: E, extra?: Record<string, any>): Result<T, E> {
        return new Result({ ok: false, error, extra });
    }

    isOk(): this is Result<T, E> & { result: Extract<ResultData<T, E>, { ok: true }> } {
        return this.result.ok;
    }

    isErr(): this is Result<T, E> & { result: Extract<ResultData<T, E>, { ok: false }> } {
        return !this.result.ok;
    }

    map<U>(fn: (data: T) => U): Result<U, E> {
        if (this.result.ok) {
            return Result.ok(fn(this.result.data), this.result.extra);
        }
        // 错误时，T 和 U 无关紧要，直接类型断言
        return new Result(this.result as ResultData<U, E>);
    }

    flatMap<U>(fn: (data: T) => Result<U, E>): Result<U, E> {
        if (this.result.ok) {
            return fn(this.result.data);
        }
        return new Result(this.result as ResultData<U, E>);
    }

    mapError<F>(fn: (error: E) => F): Result<T, F> {
        if (this.result.ok) {
            return new Result(this.result as ResultData<T, F>);
        }
        //@ts-ignore
        return Result.err(fn(this.result.error), this.result.extra);
    }

    unwrap(): T {
        if (!this.result.ok) {
            //@ts-ignore
            throw new Error(`Unwrap failed: ${JSON.stringify(this.result.error)}`);
        }
        return this.result.data;
    }

    unwrapOr(defaultValue: T): T {
        return this.result.ok ? this.result.data : defaultValue;
    }

    match<U>(handlers: { ok: (data: T) => U; err: (error: E) => U }): U {
        if (this.result.ok) {
            return handlers.ok(this.result.data);
        }
        //@ts-ignore
        return handlers.err(this.result.error);
    }

    unwrapData(): ResultData<T, E> {
        return this.result;
    }

    static async fromPromise<T, E = Error>(promise: Promise<T>): Promise<Result<T, E>> {
        try {
            return Result.ok(await promise);
        } catch (error) {
            return Result.err(error as E);
        }
    }

    static fromThrowable<T, E = Error>(fn: () => T): Result<T, E> {
        try {
            return Result.ok(fn());
        } catch (error) {
            return Result.err(error as E);
        }
    }
}

export const ok = Result.ok.bind(Result);
export const err = Result.err.bind(Result);
