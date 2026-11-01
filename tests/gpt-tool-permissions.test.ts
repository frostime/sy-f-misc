import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const html = readFileSync('src/func/gpt/setting/tool-permission-manager.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');

function page() {
    let saved: any;
    // Exercise the production page's data methods, not a reimplementation of permission merging.
    const context = {
        window: { pluginSdk: { saveOverrides: async (value: unknown) => { saved = JSON.parse(JSON.stringify(value)); }, showMessage() {} } },
        Alpine: { raw: (value: unknown) => value },
    };
    const app = runInNewContext(`${script}\nappData()`, context);
    app.tools = [
        { name: 'sy_mcp_system', description: 'native', group: 'native', executionPolicy: 'ask-always', resultApprovalPolicy: 'never' },
        { name: 'existing', description: 'local', group: 'local', executionPolicy: 'ask-once', resultApprovalPolicy: 'always' },
    ];
    return { app, saved: () => saved };
}

test('changing only result policy preserves the actual execution default through save', async () => {
    const { app, saved } = page();
    app.updateResultApprovalPolicy('sy_mcp_system', 'always');
    await app.saveAll();
    assert.deepEqual(saved().sy_mcp_system, { executionPolicy: 'ask-always', resultApprovalPolicy: 'always' });
});

test('changing execution policy preserves result default and reset restores real tool policies', async () => {
    const { app, saved } = page();
    app.updateExecutionPolicy('existing', 'auto');
    await app.saveAll();
    assert.deepEqual(saved().existing, { executionPolicy: 'auto', resultApprovalPolicy: 'always' });
    app.resetTool('existing');
    assert.equal(app.getEffectiveExecutionPolicy(app.tools[1]), 'ask-once');
    assert.equal(app.getEffectiveResultApprovalPolicy(app.tools[1]), 'always');
});

test('batch changes preserve each tool default and existing overrides independently', async () => {
    const { app, saved } = page();
    app.overrides.existing = { executionPolicy: 'ask-always', resultApprovalPolicy: 'never' };
    app.selectedTools = app.tools.map((tool: any) => tool.name);
    app.batchSetResultApprovalPolicy('always');
    await app.saveAll();
    assert.deepEqual(saved().sy_mcp_system, { executionPolicy: 'ask-always', resultApprovalPolicy: 'always' });
    assert.deepEqual(saved().existing, { executionPolicy: 'ask-always', resultApprovalPolicy: 'always' });
});
