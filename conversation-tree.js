import { randomUUID } from 'node:crypto';

export function createTree(initialPrompt, initialResponse, metadata = {}) {
  const rootId = randomUUID();
  const updatedAt = new Date().toISOString();
  return {
    rootId,
    activeId: null,
    latestNodeId: rootId,
    updatedAt,
    nodes: {
      [rootId]: createNode({
        id: rootId,
        parentId: null,
        prompt: initialPrompt,
        response: initialResponse,
        metadata
      })
    }
  };
}

export function addNode(tree, parentId, prompt, response, metadata = {}) {
  const normalized = deserialize(tree);
  const target = tree && typeof tree === 'object' && !Array.isArray(tree) ? tree : normalized;
  const targetParentId = String(parentId || '').trim();
  if (!normalized.nodes[targetParentId]) {
    throw new Error(`Parent node ${targetParentId} not found in conversation tree`);
  }

  const nodeId = randomUUID();
  target.rootId = normalized.rootId;
  target.nodes = normalized.nodes;
  target.nodes[nodeId] = createNode({
    id: nodeId,
    parentId: targetParentId,
    prompt,
    response,
    metadata
  });
  target.nodes[targetParentId].children.push(nodeId);
  target.latestNodeId = nodeId;
  target.updatedAt = new Date().toISOString();
  return nodeId;
}

export function getBranchPath(tree, nodeId) {
  const normalized = deserialize(tree);
  const targetNodeId = String(nodeId || '').trim();
  const path = [];
  let current = normalized.nodes[targetNodeId] || null;
  while (current) {
    path.unshift(current);
    current = current.parentId ? normalized.nodes[current.parentId] || null : null;
  }
  return path;
}

export function buildBranchPrompt(prompt, branchPath = []) {
  const cleanPrompt = String(prompt || '').trim();
  if (!Array.isArray(branchPath) || branchPath.length === 0) return cleanPrompt;

  const branchLines = branchPath.flatMap((node) => ([
    `- user(${node.id.slice(0, 8)}): ${String(node.prompt || '').trim()}`,
    `- assistant(${node.id.slice(0, 8)}): ${String(node.response || '').trim()}`
  ]));

  return [
    'CONVERSATION TREE CONTEXT:',
    ...branchLines,
    '',
    'CURRENT USER MESSAGE:',
    cleanPrompt
  ].join('\n').trim();
}

export function serialize(tree) {
  return JSON.stringify(deserialize(tree), null, 2);
}

export function deserialize(raw) {
  const tree = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!tree || typeof tree !== 'object' || Array.isArray(tree)) {
    throw new Error('Invalid conversation tree structure');
  }
  if (!tree.rootId || !tree.nodes || typeof tree.nodes !== 'object' || !tree.nodes[tree.rootId]) {
    throw new Error('Invalid conversation tree structure');
  }

  const normalizedNodes = Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, {
    id: String(node?.id || id),
    parentId: node?.parentId ? String(node.parentId) : null,
    children: Array.isArray(node?.children) ? node.children.map(String) : [],
    prompt: String(node?.prompt || ''),
    response: String(node?.response || ''),
    timestamp: Number(node?.timestamp || 0),
    traceId: String(node?.traceId || ''),
    sessionId: String(node?.sessionId || ''),
    metadata: node?.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata) ? node.metadata : {}
  }]));
  const latestNodeId = inferLatestNodeId(normalizedNodes, String(tree.rootId));

  return {
    rootId: String(tree.rootId),
    activeId: tree.activeId && normalizedNodes[String(tree.activeId)] ? String(tree.activeId) : null,
    latestNodeId: String(tree.latestNodeId || latestNodeId),
    updatedAt: String(tree.updatedAt || timestampToIso(normalizedNodes[String(tree.latestNodeId || latestNodeId)]?.timestamp)),
    nodes: normalizedNodes
  };
}

export function setActiveNodeId(tree, nodeId = null) {
  const normalized = deserialize(tree);
  const target = tree && typeof tree === 'object' && !Array.isArray(tree) ? tree : normalized;
  const nextId = nodeId == null || String(nodeId).trim() === ''
    ? null
    : String(nodeId).trim();

  if (nextId && !normalized.nodes[nextId]) {
    throw new Error(`Active node ${nextId} not found in conversation tree`);
  }

  target.rootId = normalized.rootId;
  target.nodes = normalized.nodes;
  target.latestNodeId = normalized.latestNodeId;
  target.updatedAt = new Date().toISOString();
  target.activeId = nextId;
  return target.activeId;
}

function createNode({ id, parentId, prompt, response, metadata }) {
  return {
    id,
    parentId,
    children: [],
    prompt: String(prompt || '').trim(),
    response: String(response || '').trim(),
    timestamp: Date.now(),
    traceId: String(metadata?.traceId || ''),
    sessionId: String(metadata?.sessionId || ''),
    metadata: { ...(metadata || {}) }
  };
}

function inferLatestNodeId(nodes, fallbackId) {
  let latestId = fallbackId;
  let latestTimestamp = Number(nodes[fallbackId]?.timestamp || 0);
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (Number(node.timestamp || 0) >= latestTimestamp) {
      latestTimestamp = Number(node.timestamp || 0);
      latestId = nodeId;
    }
  }
  return latestId;
}

function timestampToIso(timestamp) {
  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) return '';
  return new Date(Number(timestamp)).toISOString();
}
