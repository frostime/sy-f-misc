interface IExecutionResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    returned: any;
}

class JavaScriptSandBox {
    private iframe: HTMLIFrameElement | null = null;
    private timeoutMs: number;
    private messageId: number = 0;
    private pendingExecutions: Map<number, {
        resolve: (result: IExecutionResult) => void;
        timer: number;
    }> = new Map();

    private isReady: boolean = false;
    private readyPromise: Promise<void> | null = null;
    private readyResolve: (() => void) | null = null;

    constructor(timeoutMs: number = 5000) {
        this.timeoutMs = timeoutMs;
        // 绑定消息监听器（全局，只需绑定一次）
        window.addEventListener('message', this.handleMessage.bind(this));
    }

    /**
     * 初始化沙盒环境（必须在使用前调用）
     * @returns Promise，resolve 时表示沙盒已完全就绪
     */
    public async init(): Promise<void> {
        // 如果已经初始化完成，直接返回
        if (this.isReady) {
            return Promise.resolve();
        }

        // 如果正在初始化，返回现有的 Promise
        if (this.readyPromise) {
            return this.readyPromise;
        }

        // 创建新的初始化 Promise
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this.readyResolve = resolve;

            // 设置初始化超时（防止 iframe 加载失败导致永久挂起）
            const initTimeout = setTimeout(() => {
                this.readyResolve = null;
                this.readyPromise = null;
                reject(new Error('Sandbox initialization timeout'));
            }, 10000); // 10秒初始化超时

            // 清理旧 iframe（如果存在）
            if (this.iframe && this.iframe.parentNode) {
                document.body.removeChild(this.iframe);
            }

            // 创建新 iframe
            this.iframe = document.createElement('iframe');
            this.iframe.setAttribute('sandbox', 'allow-scripts');
            this.iframe.style.display = 'none';

            const sandboxHTML = `
<!DOCTYPE html>
<html>
<body>
<script>
(function() {
  // 全局输出缓冲区（持久化，每次执行会追加）
  const globalStdout = [];
  const globalStderr = [];

  // 工具函数：安全序列化
  const safeStringify = (arg) => {
    try {
      return (typeof arg === 'object' && arg !== null) ? JSON.stringify(arg) : String(arg);
    } catch(e) {
      return '[Circular/Unserializable]';
    }
  };

  // 劫持 console（持久化劫持）
  console.log = (...args) => {
    globalStdout.push(args.map(safeStringify).join(' '));
  };

  console.error = (...args) => {
    globalStderr.push(args.map(safeStringify).join(' '));
  };

  // 监听来自父页面的执行请求
  window.addEventListener('message', (event) => {
    const { type, id, code } = event.data;

    if (type === 'sandbox_execute') {
      // 清空本次执行的输出缓冲区
      const currentStdoutLength = globalStdout.length;
      const currentStderrLength = globalStderr.length;

      const result = {
        type: 'sandbox_result',
        id: id,
        ok: true,
        stdout: '',
        stderr: '',
        returned: undefined
      };

      try {
        // 执行用户代码（在全局作用域中，因此可以复用之前定义的变量）
        const evalResult = (0, eval)(code);
        result.returned = evalResult;
      } catch (e) {
        result.ok = false;
        globalStderr.push(e.toString());
      }

      // 获取本次执行产生的输出
      result.stdout = globalStdout.slice(currentStdoutLength).join('\\n');
      result.stderr = globalStderr.slice(currentStderrLength).join('\\n');

      // 处理返回值的序列化
      if (typeof result.returned === 'function' || typeof result.returned === 'symbol') {
        result.returned = String(result.returned);
      }

      // 发送结果回父页面
      window.parent.postMessage(result, '*');
    } else if (type === 'sandbox_reset') {
      // 重置环境：清空输出缓冲区
      globalStdout.length = 0;
      globalStderr.length = 0;

      window.parent.postMessage({
        type: 'sandbox_reset_complete',
        id: id
      }, '*');
    }
  });

  // 通知父页面沙盒已准备就绪
  window.parent.postMessage({ type: 'sandbox_ready' }, '*');
})();
<\/script>
</body>
</html>
`;

            // 监听 iframe 加载完成
            this.iframe.onload = () => {
                // iframe DOM 加载完成，但内部脚本可能还未执行
                // 真正的就绪状态由 sandbox_ready 消息确认
            };

            this.iframe.onerror = () => {
                clearTimeout(initTimeout);
                this.readyResolve = null;
                this.readyPromise = null;
                reject(new Error('Failed to load sandbox iframe'));
            };

            // 注入 HTML 并添加到 DOM
            this.iframe.srcdoc = sandboxHTML;
            document.body.appendChild(this.iframe);

            // 保存 timeout 引用以便在 ready 消息中清理
            (this.iframe as any)._initTimeout = initTimeout;
        });

        return this.readyPromise;
    }

    /**
     * 处理来自 iframe 的消息
     */
    private handleMessage(event: MessageEvent): void {
        if (!this.iframe || event.source !== this.iframe.contentWindow) {
            return;
        }

        const data = event.data;

        if (data.type === 'sandbox_ready') {
            // 沙盒准备就绪
            this.isReady = true;

            // 清理初始化超时
            if ((this.iframe as any)._initTimeout) {
                clearTimeout((this.iframe as any)._initTimeout);
                delete (this.iframe as any)._initTimeout;
            }

            // resolve 初始化 Promise
            if (this.readyResolve) {
                this.readyResolve();
                this.readyResolve = null;
            }
        } else if (data.type === 'sandbox_result') {
            const execution = this.pendingExecutions.get(data.id);
            if (execution) {
                clearTimeout(execution.timer);
                this.pendingExecutions.delete(data.id);
                execution.resolve({
                    ok: data.ok,
                    stdout: data.stdout,
                    stderr: data.stderr,
                    returned: data.returned
                });
            }
        } else if (data.type === 'sandbox_reset_complete') {
            const execution = this.pendingExecutions.get(data.id);
            if (execution) {
                clearTimeout(execution.timer);
                this.pendingExecutions.delete(data.id);
                execution.resolve({
                    ok: true,
                    stdout: '',
                    stderr: '',
                    returned: null
                });
            }
        }
    }

    /**
     * 执行代码
     * @throws Error 如果沙盒未初始化
     */
    public run(code: string): Promise<IExecutionResult> {
        if (!this.isReady || !this.iframe || !this.iframe.contentWindow) {
            return Promise.reject(new Error('Sandbox not initialized. Call init() first.'));
        }

        return new Promise((resolve) => {
            const id = ++this.messageId;

            // 设置超时
            const timer = window.setTimeout(() => {
                this.pendingExecutions.delete(id);
                resolve({
                    ok: false,
                    stdout: '',
                    stderr: 'Execution timed out',
                    returned: null
                });
            }, this.timeoutMs);

            this.pendingExecutions.set(id, { resolve, timer });

            // 发送执行请求
            this.iframe!.contentWindow!.postMessage({
                type: 'sandbox_execute',
                id: id,
                code: code
            }, '*');
        });
    }

    /**
     * 重置沙盒环境（完全重建 iframe）
     */
    public async reset(): Promise<void> {
        this.isReady = false;
        this.readyPromise = null;
        this.readyResolve = null;

        // 清理所有待处理的执行
        this.pendingExecutions.forEach(({ timer }) => {
            clearTimeout(timer);
        });
        this.pendingExecutions.clear();

        // 重新初始化
        await this.init();
    }

    /**
     * 销毁沙盒，释放资源
     */
    public destroy(): void {
        this.isReady = false;
        this.readyPromise = null;
        this.readyResolve = null;

        // 清理所有待处理的执行
        this.pendingExecutions.forEach(({ timer }) => {
            clearTimeout(timer);
        });
        this.pendingExecutions.clear();

        // 移除 iframe
        if (this.iframe) {
            if ((this.iframe as any)._initTimeout) {
                clearTimeout((this.iframe as any)._initTimeout);
            }
            if (this.iframe.parentNode) {
                document.body.removeChild(this.iframe);
            }
        }
        this.iframe = null;
    }

    /**
     * 检查沙盒是否已就绪
     */
    public get ready(): boolean {
        return this.isReady;
    }
}

// --- 使用示例 ---

/*
// 创建沙盒实例
const sandbox = new JavaScriptSandBox();

// 必须先初始化
await sandbox.init();

// 现在可以安全使用
const result1 = await sandbox.run(`
  const greeting = "Hello";
  function sayHello(name) {
    console.log(greeting + ", " + name + "!");
    return greeting + ", " + name;
  }
  sayHello("World");
`);
console.log('执行结果:', result1);

// 复用之前定义的变量和函数
const result2 = await sandbox.run(`
  console.log("变量 greeting 的值:", greeting);
  sayHello("Alice");
`);
console.log('第二次执行:', result2);

// 重置环境
await sandbox.reset();

// 重置后之前的变量不再存在
const result3 = await sandbox.run(`
  console.log(typeof greeting); // undefined
  const newVar = "New Environment";
  newVar;
`);
console.log('重置后执行:', result3);

// 使用完毕后销毁沙盒
sandbox.destroy();
*/

export default JavaScriptSandBox;
