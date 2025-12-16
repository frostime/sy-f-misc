/*
 * @Author       : frostime
 * Copyright (c) 2025 by frostime. All Rights Reserved.
 * @Date         : 2025-12-16 00:36:26
 * @Description  : System utilities for executing commands in SiYuan plugin environment
 * @FilePath     : /src/libs/system-utils.ts
 */

// Import Node.js modules through window.require
const fs = window?.require?.('fs');
const path = window?.require?.('path');
const childProcess = window?.require?.('child_process');
const os = window?.require?.('os');

/**
 * Platform types
 */
export type Platform = 'win32' | 'linux' | 'darwin' | 'unknown';

/**
 * Shell information
 */
export interface ShellInfo {
    shell: string;
    platform: Platform;
    hasPwsh?: boolean;
}

/**
 * Command execution options
 */
export interface ExecOptions {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
}

/**
 * Command execution result
 */
export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    success: boolean;
    error?: string;
}

/**
 * Check if running in desktop environment
 */
export const isDesktop = (): boolean => {
    return window?.require?.('electron') !== undefined;
};

/**
 * Get current platform
 */
export const getPlatform = (): Platform => {
    if (!os) return 'unknown';
    const platform = os.platform();
    if (platform === 'win32' || platform === 'linux' || platform === 'darwin') {
        return platform;
    }
    return 'unknown';
};

/**
 * Get script name for current platform
 */
export const getScriptName = (): string => {
    const platform = getPlatform();
    return platform === 'win32' ? 'PowerShell' : 'Bash';
};

/**
 * Check if a command exists in the system
 */
export const hasCommand = async (command: string): Promise<boolean> => {
    if (!childProcess) return false;

    const platform = getPlatform();
    const checkCmd = platform === 'win32' ? 'where' : 'which';

    try {
        childProcess.execSync(`${checkCmd} ${command}`, { stdio: 'ignore' });
        return true;
    } catch (_) {
        return false;
    }
};

// Cache for pwsh availability
let pwshCache: boolean | null = null;

/**
 * Get shell information for current platform
 */
export const getShellInfo = async (): Promise<ShellInfo> => {
    const platform = getPlatform();

    if (platform === 'win32') {
        if (pwshCache === null) {
            pwshCache = await hasCommand('pwsh');
        }
        return {
            shell: pwshCache ? 'pwsh' : 'powershell.exe',
            platform,
            hasPwsh: pwshCache
        };
    } else if (platform === 'linux' || platform === 'darwin') {
        return {
            shell: 'bash',
            platform
        };
    } else {
        return {
            shell: 'sh',
            platform
        };
    }
};

/**
 * Get system temporary directory
 */
export const getTempDir = (): string => {
    if (!os) throw new Error('os module not available');
    return os.tmpdir();
};

/**
 * Parse exit code from error object
 */
const parseExitCode = (error: any): number => {
    if (!error) return 0;
    if (typeof error.code === 'number') return error.code;
    // Common Node.js error codes that indicate failure
    if (error.code === 'ENOENT' || error.code === 'EACCES') return 127;
    return 1;
};

/**
 * Execute a command directly (uses shell parsing)
 */
export const execCommand = async (
    command: string,
    options: ExecOptions = {}
): Promise<ExecResult> => {
    if (!childProcess) {
        throw new Error('childProcess module not available');
    }

    const cwd = options.cwd || process.cwd();

    return new Promise((resolve) => {
        const execOptions: any = {
            cwd,
            timeout: options.timeout,
            env: { ...process.env, ...options.env },
            encoding: 'utf8'
        };

        // Disable color output on Windows
        if (getPlatform() === 'win32') {
            execOptions.env.NO_COLOR = '1';
            execOptions.env.CLICOLOR = '0';
            execOptions.env.CLICOLOR_FORCE = '0';
        }

        childProcess.exec(command, execOptions, (error, stdout, stderr) => {
            resolve({
                stdout: stdout?.trim() || '',
                stderr: stderr?.trim() || '',
                exitCode: parseExitCode(error),
                success: !error,
                error: error?.message
            });
        });
    });
};

/**
 * Execute a file with arguments (safer, no shell parsing)
 */
export const execFile = async (
    file: string,
    args: string[] = [],
    options: ExecOptions = {}
): Promise<ExecResult> => {
    if (!childProcess) {
        throw new Error('childProcess module not available');
    }

    const cwd = options.cwd || process.cwd();

    return new Promise((resolve) => {
        const execOptions: any = {
            cwd,
            timeout: options.timeout,
            env: { ...process.env, ...options.env }
        };

        childProcess.execFile(file, args, execOptions, (error, stdout, stderr) => {
            resolve({
                stdout: stdout?.trim() || '',
                stderr: stderr?.trim() || '',
                exitCode: parseExitCode(error),
                success: !error,
                error: error?.message
            });
        });
    });
};

/**
 * Execute a shell script through a temporary file
 */
export const execScript = async (
    script: string,
    options: ExecOptions = {}
): Promise<ExecResult> => {
    if (!fs || !path) {
        throw new Error('Required Node.js modules not available');
    }

    const shellInfo = await getShellInfo();
    const tempDir = getTempDir();
    const timestamp = Date.now();
    const scriptExt = shellInfo.platform === 'win32' ? 'ps1' : 'sh';
    const scriptPath = path.join(tempDir, `shell_${timestamp}.${scriptExt}`);

    // Prepare script content with encoding fixes
    let scriptContent = script;
    if (shellInfo.platform === 'win32') {
        scriptContent = `# Set UTF-8 encoding for output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
# Disable color output to avoid ANSI escape sequences
$PSStyle.OutputRendering = [System.Management.Automation.OutputRendering]::PlainText
# Disable ANSI color output for external programs
$env:NO_COLOR = '1'
$env:CLICOLOR = '0'
$env:CLICOLOR_FORCE = '0'

# User script starts here
${script}`.trim();
    }

    // Write script to file
    fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

    try {
        const shellArgs = shellInfo.platform === 'win32'
            ? ['-NoProfile', '-NonInteractive', '-File', scriptPath]
            : [scriptPath];

        const result = await execFile(shellInfo.shell, shellArgs, options);
        return result;
    } finally {
        // Clean up temporary file
        try {
            fs.unlinkSync(scriptPath);
        } catch (e) {
            console.error('Failed to delete temporary script file:', e);
        }
    }
};

/**
 * Execute Python code through a temporary file
 */
export const execPython = async (
    code: string,
    options: ExecOptions & { keepFile?: boolean; pythonCommand?: string } = {}
): Promise<ExecResult & { scriptPath?: string }> => {
    if (!fs || !path) {
        throw new Error('Required Node.js modules not available');
    }

    const cwd = options.cwd || process.cwd();
    const tempDir = path.join(getTempDir(), 'siyuan_temp');

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const timestamp = Date.now();
    const scriptPath = path.join(tempDir, `python_${timestamp}.py`);

    // Add encoding fixes to Python code
    const fixedCode = `# -*- coding: utf-8 -*-
import sys
import io

# Set UTF-8 encoding for stdout
if hasattr(sys.stdout, 'buffer') and sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# User code starts here
${code}`.trim();

    // Write Python code to file
    fs.writeFileSync(scriptPath, fixedCode, 'utf-8');

    try {
        const pythonCmd = options.pythonCommand || 'python';
        const result = await execFile(pythonCmd, [scriptPath], { ...options, cwd });

        if (options.keepFile) {
            return { ...result, scriptPath };
        }

        return result;
    } finally {
        // Clean up if not keeping file
        if (!options.keepFile) {
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {
                console.error('Failed to delete temporary Python script:', e);
            }
        }
    }
};
