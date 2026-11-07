#!/usr/bin/env node
// Arya Computer Use — adapter MCP server (skeleton).
//
// Design (docs/PLAN.md §2): this server owns the tool surface (DSH has no
// server-side tool filtering) and proxies the agent-desktop CLI per call,
// injecting --session/--agent-id/--headed per conversation.
//
// Phase 1: Lite 14 tools (snapshot, find, get, is, click, set_value, type,
// press, scroll, list_windows, launch, wait, screenshot→file path, ocr, tools).
// This skeleton answers the MCP handshake so the row can be verified
// (mcp__arya_desktop__* connection) with an empty tool list.

import * as readline from 'node:readline';

const PROTOCOL = '2025-06-18';
const SERVER_INFO = { name: 'arya_desktop', version: '0.1.0' };

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const replyError = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: { listChanged: true } },
      serverInfo: SERVER_INFO,
      instructions:
        'Arya Computer Use adapter (skeleton). Full Lite tool set lands in Phase 1; see docs/PLAN.md.',
    });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    reply(id, { tools: [] }); // TODO(Phase 1): Lite 14 tool definitions.
    return;
  }
  if (method === 'tools/call') {
    reply(id, {
      content: [{ type: 'text', text: 'arya-computer-use adapter is a skeleton; tools land in Phase 1.' }],
      isError: true,
    });
    return;
  }
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (id !== undefined) replyError(id, -32601, `unsupported method: ${method}`);
});
