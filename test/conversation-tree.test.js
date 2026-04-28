import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { addNode, buildBranchPrompt, createTree, deserialize, getBranchPath, serialize } from '../packages/qwen-core/conversation-tree.js';
import { appendTurn, buildBranchContextPrompt, buildConversationTreePayload, loadTree, printTree, resolveBranchTarget, resolveConversationTreeFile, saveTree } from '../packages/qwen-core/conversation-tree-store.js';

test('createTree initializes a valid root node', () => {
  const tree = createTree('init prompt', 'init response', { traceId: 't1' });
  assert.ok(tree.rootId);
  assert.equal(tree.activeId, null);
  assert.equal(tree.latestNodeId, tree.rootId);
  assert.ok(tree.nodes[tree.rootId]);
  assert.equal(tree.nodes[tree.rootId].parentId, null);
  assert.deepEqual(tree.nodes[tree.rootId].children, []);
});

test('addNode links a child to its parent', () => {
  const tree = createTree('p1', 'r1');
  const childId = addNode(tree, tree.rootId, 'p2', 'r2');
  assert.equal(tree.latestNodeId, childId);
  assert.equal(tree.nodes[childId].parentId, tree.rootId);
  assert.deepEqual(tree.nodes[tree.rootId].children, [childId]);
});

test('getBranchPath returns ordered lineage', () => {
  const tree = createTree('root', 'resp0');
  const child1 = addNode(tree, tree.rootId, 'child1', 'resp1');
  const child2 = addNode(tree, child1, 'child2', 'resp2');
  const branchPath = getBranchPath(tree, child2);
  assert.equal(branchPath.length, 3);
  assert.equal(branchPath[0].id, tree.rootId);
  assert.equal(branchPath[2].id, child2);
});

test('serialize/deserialize roundtrip preserves structure', () => {
  const tree = createTree('p', 'r');
  addNode(tree, tree.rootId, 'p2', 'r2');
  assert.deepEqual(deserialize(serialize(tree)), tree);
});

test('buildBranchPrompt injects branch context before current user message', () => {
  const tree = createTree('root prompt', 'root response');
  const childId = addNode(tree, tree.rootId, 'child prompt', 'child response');
  const prompt = buildBranchPrompt('new prompt', getBranchPath(tree, childId));
  assert.match(prompt, /CONVERSATION TREE CONTEXT:/);
  assert.match(prompt, /assistant/);
  assert.match(prompt, /CURRENT USER MESSAGE:/);
  assert.match(prompt, /new prompt/);
});

test('appendTurn persists a new tree and extends branches', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-conversation-tree-'));
  const filePath = path.join(tempDir, 'tree.json');

  try {
    const first = await appendTurn(null, 'first', 'reply', { traceId: 't1' }, filePath);
    assert.ok(first.nodeId);
    const second = await appendTurn(first.nodeId, 'second', 'reply2', { traceId: 't2' }, filePath);
    const restored = await loadTree(filePath);
    assert.equal(Object.keys(restored.nodes).length, 2);
    assert.equal(restored.nodes[second.nodeId].parentId, first.nodeId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('appendTurn can advance the checked-out branch to the new node', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-conversation-active-'));
  const filePath = path.join(tempDir, 'tree.json');

  try {
    const first = await appendTurn(null, 'first', 'reply', { traceId: 't1' }, filePath);
    const tree = await loadTree(filePath);
    tree.activeId = first.nodeId;
    await saveTree(tree, filePath);

    const second = await appendTurn(first.nodeId, 'second', 'reply2', { traceId: 't2' }, filePath, { setActiveNode: true });
    assert.equal(second.tree.activeId, second.nodeId);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('resolveBranchTarget returns tree, node, and path', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omo-conversation-branch-'));
  const filePath = path.join(tempDir, 'tree.json');

  try {
    const tree = createTree('root', 'resp');
    const childId = addNode(tree, tree.rootId, 'child', 'resp2');
    await saveTree(tree, filePath);
    const branch = await resolveBranchTarget(childId, filePath);
    assert.equal(branch.targetNode.id, childId);
    assert.equal(branch.path.length, 2);
    assert.equal(branch.details.activeNodeId, childId);
    assert.match(buildBranchContextPrompt('follow-up', branch), /follow-up/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('printTree renders a compact tree summary with latest and active markers', () => {
  const tree = createTree('root prompt', 'root response');
  const childId = addNode(tree, tree.rootId, 'child prompt', 'child response');
  const lines = [];
  printTree(tree, (line) => lines.push(line));
  assert.equal(lines.length, 3);
  assert.match(lines[0], /●/);
  assert.match(lines[0], /path/);
  assert.match(lines[1], /└─/);
  assert.match(lines[1], new RegExp(childId.slice(0, 8)));
  assert.match(lines[1], /active/);
  assert.match(lines[1], /latest/);
  assert.match(lines[2], /latest:/);
});

test('resolveConversationTreeFile honors explicit and env values', () => {
  const explicit = resolveConversationTreeFile('artifacts/tree.json');
  assert.match(explicit, /artifacts\/tree\.json$/);
});

test('buildConversationTreePayload returns path and role history for the active node', () => {
  const tree = createTree('root prompt', 'root response');
  const childId = addNode(tree, tree.rootId, 'child prompt', 'child response');
  const payload = buildConversationTreePayload(tree, childId);
  assert.equal(payload.latestNodeId, childId);
  assert.equal(payload.activeNodeId, childId);
  assert.equal(payload.path.length, 2);
  assert.equal(payload.history.length, 4);
  assert.equal(payload.path.at(-1).isActive, true);
  assert.equal(payload.path.at(-1).isLatest, true);
});

test('deserialize infers latest node from legacy trees without latestNodeId', () => {
  const legacyTree = {
    rootId: 'root',
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        children: ['child'],
        prompt: 'root prompt',
        response: 'root response',
        timestamp: 100
      },
      child: {
        id: 'child',
        parentId: 'root',
        children: [],
        prompt: 'child prompt',
        response: 'child response',
        timestamp: 200
      }
    }
  };

  const restored = deserialize(legacyTree);
  assert.equal(restored.latestNodeId, 'child');
  assert.match(restored.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
