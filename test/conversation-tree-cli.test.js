import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTree, addNode } from '../conversation-tree.js';
import { buildTreeLines, checkoutNode, loadConversationTreeForCli } from '../lib/conversation-tree-cli.js';
import { resolveConversationTreeFile, saveTree } from '../conversation-tree-store.js';

test('buildTreeLines formats hierarchy and highlights active node', () => {
  const tree = createTree('Root', 'root response');
  tree.nodes[tree.rootId].prompt = 'Root';
  const childId = addNode(tree, tree.rootId, 'Child 1', 'resp');
  addNode(tree, tree.rootId, 'Child 2', 'resp2');
  tree.activeId = childId;

  const output = buildTreeLines(tree, { color: true });
  assert.match(output, /Root/);
  assert.match(output, /Child 1/);
  assert.match(output, /Child 2/);
  assert.match(output, /\x1b\[32m/);
  assert.match(output, /checked-out:/);
});

test('checkoutNode switches activeId and persists', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-tree-checkout-'));
  const filePath = path.join(tmpDir, path.basename(resolveConversationTreeFile()));
  const tree = createTree('A', 'ra');
  const childId = addNode(tree, tree.rootId, 'B', 'rb');

  try {
    await saveTree(tree, filePath);
    const updated = await checkoutNode(childId, filePath);
    assert.equal(updated.activeId, childId);

    const reloaded = await loadConversationTreeForCli(filePath);
    assert.equal(reloaded.activeId, childId);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('checkoutNode supports clearing the active node', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-tree-clear-'));
  const filePath = path.join(tmpDir, path.basename(resolveConversationTreeFile()));
  const tree = createTree('A', 'ra');

  try {
    tree.activeId = tree.rootId;
    await saveTree(tree, filePath);
    const updated = await checkoutNode('none', filePath);
    assert.equal(updated.activeId, null);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
