import {
    Tool,
    ToolPermissionLevel,
    ToolExecuteStatus,
    ToolExecuteResult
} from '../types';

/**
 * fetch 工具
 */
const fetchTool: Tool = {
    definition: {
        type: 'function',
        function: {
            name: 'fetch',
            description: '发送 HTTP 请求获取网页内容',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: '要请求的 URL'
                    },
                    method: {
                        type: 'string',
                        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
                        description: 'HTTP 请求方法，默认为 GET'
                    },
                    headers: {
                        type: 'object',
                        description: 'HTTP 请求头',
                        properties: {}  // 动态属性，不限制具体字段
                    },
                    body: {
                        type: 'string',
                        description: 'HTTP 请求体，用于 POST/PUT/PATCH 请求'
                    },
                    timeout: {
                        type: 'integer',
                        description: '请求超时时间（毫秒），默认为 10000'
                    }
                },
                required: ['url']
            }
        },
        // 设置权限级别为中等，需要用户首次审核
        permissionLevel: ToolPermissionLevel.MODERATE
    },

    execute: async (args: {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
        timeout?: number;
    }): Promise<ToolExecuteResult> => {
        try {
            const { url, method = 'GET', headers = {}, body, timeout = 10000 } = args;

            // 创建 AbortController 用于超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // 构建请求选项
            const options: RequestInit = {
                method,
                headers,
                signal: controller.signal
            };

            // 添加请求体（如果有）
            if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
                options.body = body;
            }

            // 发送请求
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            // 处理响应
            const contentType = response.headers.get('content-type') || '';
            let data: any;

            if (contentType.includes('application/json')) {
                data = await response.json();
            } else if (contentType.includes('text/')) {
                data = await response.text();
            } else {
                // 对于二进制数据，返回 base64 编码
                const buffer = await response.arrayBuffer();
                const base64String = btoa(
                    new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                data = {
                    type: contentType,
                    data: base64String,
                    encoding: 'base64'
                };
            }

            return {
                status: response.ok ? ToolExecuteStatus.SUCCESS : ToolExecuteStatus.ERROR,
                data: {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries([...response.headers.entries()]),
                    data
                },
                error: response.ok ? undefined : `HTTP error: ${response.status} ${response.statusText}`
            };
        } catch (error) {
            return {
                status: ToolExecuteStatus.ERROR,
                error: `Fetch error: ${error.message}`
            };
        }
    }
};

// 默认导出
export default fetchTool;
