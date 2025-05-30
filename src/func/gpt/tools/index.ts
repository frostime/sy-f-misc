// 导出类型和工具执行器
export * from './types';

import { ToolExecutor } from './executor';
// 导入工具
import fetchTool from './fetch';
import * as utilsTools from './utils';



export const toolExecutorFactory = () => {
    // 注册工具
    const toolExecutor = new ToolExecutor();
    toolExecutor.registerTool(fetchTool);
    toolExecutor.registerToolModule(utilsTools);
    return toolExecutor;
}

