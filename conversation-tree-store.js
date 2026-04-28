import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWriteJson } from './lib/memory-writer.js';
import { addNode, buildBranchPrompt, createTree, deserialize, getBranchPath, setActiveNodeId } from './conversation-tree.js';
import { getScopedEnv } from './packages/qwen-core/runtime-config.js';

export const TREE_FILE = resolveConversationTreeFile();

export function resolveConversationTreeFile(explicitPath = '') {
  const configured = String(explicitPath || getScopedEnv('CONVERSATION_FILE', '')).trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return path.join(process.cwd(), '.coder-sin-qwen-conversations.json');
}

export async function loadTree(filePath = TREE_FILE) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return deserialize(raw);
  } catch {
    return null;
  }
}

export async function saveTree(tree, filePath = TREE_FILE) {
  const normalized = deserialize(tree);
  await atomicWriteJson(filePath, normalized);
  return normalized;
}

export async function appendTurn(parentId, prompt, response, metadata = {}, filePath = TREE_FILE, options = {}) {
  let tree = await loadTree(filePath);
  let nodeId = '';
  const sessionId = metadata?.sessionId || '';
  const isExplicitBranch = Boolean(parentId && String(parentId).trim());  
  if (!tree) {
    tree = createTree(prompt, response, metadata);
    nodeId = tree.rootId;
  } else if (isExplicitBranch) {
    const targetParent = String(parentId).trim();
    nodeId = addNode(tree, targetParent, prompt, response, metadata);
  } else if (sessionId) {
    const sessionNodes = Object.values(tree.nodes).filter(n => n.sessionId === sessionId);
    const latestSessionNode = sessionNodes.sort((a, b) => b.timestamp - a.timestamp)[0];
    if (latestSessionNode) {
      nodeId = addNode(tree, latestSessionNode.id, prompt, response, metadata);
    } else {
      nodeId = addNode(tree, tree.rootId, prompt, response, metadata);
    }
  } else {
    const targetParent = String(parentId || tree.rootId).trim();
    nodeId = addNode(tree, targetParent, prompt, response, metadata);
  }
  if (options.setActiveNode === true) {
    setActiveNodeId(tree, nodeId);
  }
  const savedTree = await saveTree(tree, filePath);
  return { tree: savedTree, nodeId };
}

export async function resolveBranchTarget(branchId, filePath = TREE_FILE) {
  const tree = await loadTree(filePath);
  if (!tree) return null;
  const targetId = String(branchId || '').trim();
  if (!tree.nodes[targetId]) {
    throw new Error(`Branch target ${targetId} not found`);
  }
  return {
    tree,
    targetNode: tree.nodes[targetId],
    path: getBranchPath(tree, targetId),
    details: buildConversationTreePayload(tree, targetId)
  };
}

export function printTree(tree, output = console.log, options = {}) {
  if (!tree) {
    output('No conversation tree found.');
    return;
  }

  const normalized = deserialize(tree);
  const checkedOutNodeId = normalized.activeId ? String(normalized.activeId).trim() : '';
  const activeNodeId = String(options.activeNodeId || checkedOutNodeId || normalized.latestNodeId || normalized.rootId).trim();
  const activePathIds = new Set(getBranchPath(normalized, activeNodeId).map((node) => node.id));
  const useColor = options.color !== false;

  const render = (nodeId, prefix = '', isLast = true, isRoot = false) => {
    const node = normalized.nodes[nodeId];
    const branchMarker = isRoot ? '●' : isLast ? '└─' : '├─';
    const summary = summarizeNodeText(node.prompt);
    const tags = [];
    if (activePathIds.has(node.id)) tags.push(node.id === activeNodeId ? 'active' : 'path');
    if (checkedOutNodeId && node.id === checkedOutNodeId && checkedOutNodeId !== activeNodeId) tags.push('checked-out');
    if (node.id === normalized.latestNodeId) tags.push('latest');
    const tagSuffix = tags.length ? ` [${tags.join(', ')}]` : '';
    const line = `${prefix}${branchMarker} [${nodeId.slice(0, 8)}] ${summary}${tagSuffix}`;
    output(colorizeLine(line, tags, useColor));

    const childPrefix = `${prefix}${isRoot ? '' : isLast ? '  ' : '│ '}`;
    node.children.forEach((childId, index) => {
      render(childId, childPrefix, index === node.children.length - 1, false);
    });
  };

  render(normalized.rootId, '', true, true);
  output(`active: ${activeNodeId ? activeNodeId.slice(0, 8) : 'none'} | checked-out: ${checkedOutNodeId ? checkedOutNodeId.slice(0, 8) : 'none'} | latest: ${String(normalized.latestNodeId || normalized.rootId).slice(0, 8)} | nodes: ${Object.keys(normalized.nodes).length} | leaves: ${countLeafNodes(normalized)}`);
}

export function buildBranchContextPrompt(prompt, branchTarget) {
  return buildBranchPrompt(prompt, branchTarget?.path || []);
}

export function buildConversationTreePayload(tree, nodeId = '') {
  const normalized = deserialize(tree);
  const checkedOutNodeId = normalized.activeId ? String(normalized.activeId).trim() : '';
  const activeNodeId = String(nodeId || checkedOutNodeId || normalized.latestNodeId || normalized.rootId).trim();
  const path = getBranchPath(normalized, activeNodeId);
  const latestNodeId = String(normalized.latestNodeId || normalized.rootId);

  return {
    rootId: normalized.rootId,
    checkedOutNodeId: checkedOutNodeId || null,
    latestNodeId,
    activeNodeId,
    updatedAt: normalized.updatedAt || '',
    nodeCount: Object.keys(normalized.nodes).length,
    leafCount: countLeafNodes(normalized),
    path: path.map((node, index) => ({
      id: node.id,
      parentId: node.parentId,
      depth: index,
      prompt: node.prompt,
      response: node.response,
      promptSummary: summarizeNodeText(node.prompt),
      responseSummary: summarizeNodeText(node.response, 80),
      childCount: node.children.length,
      timestamp: node.timestamp,
      isCheckedOut: node.id === checkedOutNodeId,
      isLatest: node.id === latestNodeId,
      isActive: node.id === activeNodeId
    })),
    history: path.flatMap((node) => ([
      { role: 'user', nodeId: node.id, content: node.prompt, timestamp: node.timestamp },
      { role: 'assistant', nodeId: node.id, content: node.response, timestamp: node.timestamp }
    ]))
  };
}

export async function checkoutConversationNode(targetId, filePath = TREE_FILE) {
  const tree = await loadTree(filePath);
  if (!tree) {
    throw new Error('No conversation tree found.');
  }

  const normalizedTarget = String(targetId || '').trim().toLowerCase();
  if (!normalizedTarget) {
    throw new Error('Conversation checkout target is required.');
  }

  const resolvedTargetId = normalizedTarget === 'latest'
    ? String(tree.latestNodeId || tree.rootId)
    : normalizedTarget === 'root'
      ? String(tree.rootId)
      : normalizedTarget === 'none' || normalizedTarget === 'clear'
        ? null
        : String(targetId || '').trim();

  setActiveNodeId(tree, resolvedTargetId);
  const savedTree = await saveTree(tree, filePath);
  return {
    tree: savedTree,
    activeId: savedTree.activeId || null,
    payload: buildConversationTreePayload(savedTree, savedTree.activeId || savedTree.latestNodeId || savedTree.rootId)
  };
}

function countLeafNodes(tree) {
  return Object.values(tree.nodes).filter((node) => !node.children.length).length;
}

function summarizeNodeText(text, limit = 60) {
  const normalized = String(text || '').replace(/\s+/gu, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

function colorizeLine(line, tags, useColor) {
  if (!useColor) return line;
  if (tags.includes('active')) return `\x1b[32m${line}\x1b[0m`;
  if (tags.includes('latest')) return `\x1b[33m${line}\x1b[0m`;
  return line;
}
