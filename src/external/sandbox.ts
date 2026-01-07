interface IExecutionResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    returned: any;
}

export class JavaScriptSandBox {
    private iframe: HTMLIFrameElement | null = null;
    private timeoutMs: number;
    private allowSameOrigin: boolean;
    private logViolations: boolean;

    private isReady: boolean = false;
    private readyPromise: Promise<void> | null = null;

    constructor(options: {
        timeoutMs?: number;
        allowSameOrigin?: boolean;
        logViolations?: boolean;
    } = {}) {
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.allowSameOrigin = options.allowSameOrigin ?? true;
        this.logViolations = options.logViolations ?? true;
    }

    public async init(): Promise<void> {
        if (this.isReady) {
            return Promise.resolve();
        }

        if (this.readyPromise) {
            return this.readyPromise;
        }

        this.readyPromise = new Promise<void>((resolve, reject) => {
            const initTimeout = setTimeout(() => {
                this.readyPromise = null;
                reject(new Error('Sandbox initialization timeout'));
            }, 10000);

            if (this.iframe && this.iframe.parentNode) {
                document.body.removeChild(this.iframe);
            }

            this.iframe = document.createElement('iframe');

            const sandboxAttr = this.allowSameOrigin
                ? 'allow-scripts allow-same-origin'
                : 'allow-scripts';

            this.iframe.setAttribute('sandbox', sandboxAttr);
            this.iframe.style.display = 'none';

            const sandboxHTML = this.buildSandboxHTML();

            this.iframe.onload = () => {
                clearTimeout(initTimeout);
                // 等待沙盒 API 初始化
                const checkReady = () => {
                    if (this.iframe?.contentWindow?.['__sandboxAPI']) {
                        this.isReady = true;
                        // 注入一些东西进去
                        if (this.iframe.contentWindow) {
                          this.iframe.contentWindow['lute'] = window.Lute.New();
                        }
                        resolve();
                    } else {
                        setTimeout(checkReady, 10);
                    }
                };
                checkReady();
            };

            this.iframe.onerror = () => {
                clearTimeout(initTimeout);
                this.readyPromise = null;
                reject(new Error('Failed to load sandbox iframe'));
            };

            this.iframe.srcdoc = sandboxHTML;
            document.body.appendChild(this.iframe);
        });

        return this.readyPromise;
    }

    private buildSandboxHTML(): string {
        const logViolations = this.logViolations;

        return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<script>
(function() {
  'use strict';

  const LOG_VIOLATIONS = ${logViolations};

  // ============ 安全防护：劫持全局属性 ============

  const createBlockedProxy = (targetName) => {
    return new Proxy({}, {
      get(target, prop) {
        if (LOG_VIOLATIONS) {
          console.error(\`[Security] Blocked access to \${targetName}.\${String(prop)}\`);
        }
        return undefined;
      },
      set(target, prop) {
        if (LOG_VIOLATIONS) {
          console.error(\`[Security] Blocked modification of \${targetName}.\${String(prop)}\`);
        }
        return false;
      },
      has() { return false; },
      deleteProperty() { return false; },
      ownKeys() { return []; },
      getOwnPropertyDescriptor() { return undefined; }
    });
  };

  // 尝试劫持危险属性
  const dangerousProps = ['parent', 'top', 'frameElement', 'opener'];

  dangerousProps.forEach(prop => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, prop);
      if (descriptor && descriptor.configurable) {
        Object.defineProperty(window, prop, {
          get() {
            if (LOG_VIOLATIONS) {
              console.error(\`[Security] Blocked access to window.\${prop}\`);
            }
            return createBlockedProxy(\`window.\${prop}\`);
          },
          set() {
            if (LOG_VIOLATIONS) {
              console.error(\`[Security] Blocked modification of window.\${prop}\`);
            }
            return false;
          },
          configurable: false,
          enumerable: true
        });
      } else if (LOG_VIOLATIONS) {
        console.warn(\`[Security] Cannot protect window.\${prop} (not configurable)\`);
      }
    } catch (e) {
      if (LOG_VIOLATIONS) {
        console.warn(\`[Security] Failed to protect window.\${prop}:\`, e.message);
      }
    }
  });

  if (LOG_VIOLATIONS) {
    console.log('[Security] Sandbox protection initialized');
  }

  // ============ 执行环境 ============

  const globalStdout = [];
  const globalStderr = [];

  const safeStringify = (arg) => {
    try {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        return JSON.stringify(arg);
      }
      return String(arg);
    } catch (e) {
      return '[Unserializable]';
    }
  };

  // 劫持 console
  const originalConsole = { ...console };

  console.log = (...args) => {
    globalStdout.push(args.map(safeStringify).join(' '));
  };

  console.error = (...args) => {
    globalStderr.push(args.map(safeStringify).join(' '));
  };

  console.warn = (...args) => {
    globalStderr.push('[WARN] ' + args.map(safeStringify).join(' '));
  };

  console.debug = originalConsole.debug || (() => {});

  // ============ 暴露给父页面的 API ============

  window.__sandboxAPI = {
    /**
     * 执行代码（支持 async/await）
     * @param {string} code - 用户代码
     * @returns {Promise<object>} 执行结果
     */
    execute: async (code) => {
      const currentStdoutLength = globalStdout.length;
      const currentStderrLength = globalStderr.length;

      const result = {
        ok: true,
        stdout: '',
        stderr: '',
        returned: undefined
      };

      try {
        // ✅ 使用 async function 包装，支持 await
        const wrappedCode = \`
          (async function() {
            // 遮蔽全局变量
            const parent = undefined;
            const top = undefined;
            const frameElement = undefined;
            const opener = undefined;

            // 执行用户代码（支持 await）
            return await (async function() {
              "use strict";
              \${code}
            })();
          })()
        \`;

        // await 异步执行结果
        result.returned = await (0, eval)(wrappedCode);

      } catch (e) {
        result.ok = false;
        globalStderr.push(\`\${e.name}: \${e.message}\`);
        if (e.stack) {
          globalStderr.push(e.stack);
        }
      }

      // 收集输出
      result.stdout = globalStdout.slice(currentStdoutLength).join('\\n');
      result.stderr = globalStderr.slice(currentStderrLength).join('\\n');

      // 序列化返回值
      if (typeof result.returned === 'function') {
        result.returned = '[Function]';
      } else if (typeof result.returned === 'symbol') {
        result.returned = result.returned.toString();
      } else if (result.returned instanceof Promise) {
        // 理论上不会到这里，因为外层已经 await 了
        result.returned = '[Promise]';
      }

      return result;
    },

    reset: () => {
      globalStdout.length = 0;
      globalStderr.length = 0;
      return { ok: true };
    },

    getState: () => {
      return {
        stdoutLength: globalStdout.length,
        stderrLength: globalStderr.length
      };
    }
  };

  window.__sandboxReady = true;

  if (LOG_VIOLATIONS) {
    console.debug('[Sandbox] API ready');
  }
})();
</script>
</body>
</html>
`;
    }


    public async run(code: string): Promise<IExecutionResult> {
        if (!this.isReady || !this.iframe?.contentWindow) {
            return Promise.reject(new Error('Sandbox not initialized. Call init() first.'));
        }

        return new Promise(async (resolve) => {
            // 设置超时
            const timer = setTimeout(() => {
                resolve({
                    ok: false,
                    stdout: '',
                    stderr: 'Execution timed out',
                    returned: null
                });
            }, this.timeoutMs);

            try {
                const api = this.iframe.contentWindow['__sandboxAPI'];

                if (!api || typeof api.execute !== 'function') {
                    clearTimeout(timer);
                    resolve({
                        ok: false,
                        stdout: '',
                        stderr: 'Sandbox API not available',
                        returned: null
                    });
                    return;
                }

                const result = await api.execute(code);

                clearTimeout(timer);
                resolve(result);

            } catch (error) {
                clearTimeout(timer);
                resolve({
                    ok: false,
                    stdout: '',
                    stderr: `Execution error: ${error.message}`,
                    returned: null
                });
            }
        });
    }

    public async reset(): Promise<void> {
        if (!this.iframe?.contentWindow) {
            throw new Error('Sandbox not initialized');
        }

        try {
            const api = this.iframe.contentWindow['__sandboxAPI'];
            if (api && typeof api.reset === 'function') {
                api.reset();
            }
        } catch (e) {
            console.warn('Reset failed:', e);
        }
    }

    public destroy(): void {
        this.isReady = false;
        this.readyPromise = null;

        if (this.iframe) {
            if (this.iframe.parentNode) {
                document.body.removeChild(this.iframe);
            }
        }
        this.iframe = null;
    }

    public get ready(): boolean {
        return this.isReady;
    }
}

// export default JavaScriptSandBox;



// --- 使用示例 ---

/*
const sandbox = new JavaScriptSandBox();
await sandbox.init();

// ✅ 支持 async/await
const result = await sandbox.run(`
  console.log('开始请求...');
  const response = await fetch('/api/notebook/lsNotebooks');
  const data = await response.json();
  console.log('请求完成，笔记本数量:', data.data.notebooks.length);
  return data;
`);

console.log(result);
// {
//   ok: true,
//   stdout: "开始请求...\n请求完成，笔记本数量: 3",
//   stderr: "",
//   returned: { code: 0, data: { notebooks: [...] }, msg: "" }
// }

// ✅ 支持顶层 await
await sandbox.run(`
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  await delay(100);
  console.log('延迟完成');
  return 'done';
`);

// ✅ 无法访问父页面
await sandbox.run(`
  console.log(typeof parent);  // "undefined"
  console.log(typeof top);     // "undefined"
`);


// 使用完毕后销毁沙盒
sandbox.destroy();
*/
