import { buildConversationTreePayload, checkoutConversationNode, loadTree, printTree } from '../conversation-tree-store.js';

export async function loadConversationTreeForCli(filePath) {
  return loadTree(filePath);
}

export function buildTreeLines(tree, options = {}) {
  const lines = [];
  printTree(tree, (line) => lines.push(line), options);
  return lines.join('\n');
}

export async function checkoutNode(targetId, filePath) {
  return checkoutConversationNode(targetId, filePath);
}

export function buildTreeJson(tree, nodeId = '') {
  return buildConversationTreePayload(tree, nodeId);
}
