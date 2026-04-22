import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_MEMORY_FILE = '.omo-sin-qwen-memory.json';
const CONTEXT_REUSE_WINDOW_MS = 1000 * 60 * 60 * 24;

export async function hydrateConsultContext(baseContext, prompt) {
  if (typeof baseContext === 'string') {
    return {
      context: baseContext,
      consultMeta: null
    };
  }

  const memoryFile = resolveMemoryFile();
  const memory = await readMemoryFile(memoryFile);
  const repoKey = baseContext.repo?.urls?.web || baseContext.repo?.cwd || 'unknown-repo';
  const branch = baseContext.repo?.branch || 'N/A';
  const contextId = findReusableContextId(memory, repoKey, branch) || randomUUID();
  const previousEntry = memory.contexts?.[contextId] || null;
  const messageId = randomUUID();

  const stateSnapshot = buildStateSnapshot(baseContext, {
    contextId,
    messageId,
    previousMessageId: previousEntry?.lastMessageId || '',
    previousSummary: previousEntry?.latestSummary || '',
    decisionHistory: previousEntry?.decisionHistory || []
  });

  return {
    context: {
      ...baseContext,
      stateSnapshot,
      previousSummary: previousEntry?.latestSummary || ''
    },
    consultMeta: {
      memoryFile,
      repoKey,
      contextId,
      messageId,
      previousMessageId: previousEntry?.lastMessageId || ''
    }
  };
}

export async function persistConsultMemory({ consultMeta, context, prompt, reply, parsed }) {
  if (!consultMeta || typeof context === 'string') return;

  const memory = await readMemoryFile(consultMeta.memoryFile);
  const summary = buildSummary(reply, parsed);
  const previousEntry = memory.contexts?.[consultMeta.contextId] || {};
  const decisionEntry = buildDecisionEntry({ prompt, summary, parsed });
  const contextEntry = {
    repoKey: consultMeta.repoKey,
    repoUrl: context.repo?.urls?.web || '',
    branch: context.repo?.branch || 'N/A',
    head: context.repo?.head || 'N/A',
    dirty: Boolean(context.repo?.dirty),
    updatedAt: new Date().toISOString(),
    lastMessageId: consultMeta.messageId,
    previousMessageId: consultMeta.previousMessageId || '',
    latestPrompt: prompt,
    latestSummary: summary,
    latestStatus: parsed?.payload?.status || '',
    latestDecision: decisionEntry,
    constraints: context.constraints || [],
    completionCriteria: context.completionCriteria || [],
    references: (context.references || []).slice(0, 6),
    fileReferences: (context.fileReferences || []).slice(0, 8),
    decisionHistory: trimDecisionHistory([
      ...(previousEntry.decisionHistory || []),
      decisionEntry
    ]),
    history: trimHistory([
      ...(previousEntry.history || []),
      {
        messageId: consultMeta.messageId,
        timestamp: new Date().toISOString(),
        prompt,
        summary
      }
    ])
  };

  const nextMemory = {
    version: 1,
    updatedAt: new Date().toISOString(),
    contexts: {
      ...(memory.contexts || {}),
      [consultMeta.contextId]: contextEntry
    }
  };

  await fs.writeFile(consultMeta.memoryFile, `${JSON.stringify(nextMemory, null, 2)}\n`, 'utf8');
}

export function resolveMemoryFile() {
  return process.env.SIN_OMO_QWEN_MEMORY_FILE || path.join(process.cwd(), DEFAULT_MEMORY_FILE);
}

export function buildStateSnapshot(context, meta) {
  return {
    protocolVersion: 'A2A-v2.1-lite',
    messageId: meta.messageId,
    metadata: {
      sender: 'omo-SIN-Qwen',
      receiver: 'Qwen',
      timestamp: new Date().toISOString(),
      contextId: meta.contextId,
      previousMessageId: meta.previousMessageId || ''
    },
    mandate: String(context.prompt || ''),
    stateSnapshot: {
      repositoryUrl: context.repo?.urls?.web || '',
      commitUrl: context.repo?.urls?.commit || '',
      treeUrl: context.repo?.urls?.tree || '',
      branch: context.repo?.branch || 'N/A',
      head: context.repo?.head || 'N/A',
      dirty: Boolean(context.repo?.dirty),
      affectedFiles: (context.fileReferences || []).slice(0, 8),
      references: (context.references || []).slice(0, 6)
    },
    decisionHistory: (meta.decisionHistory || []).slice(-3),
    previousSummary: meta.previousSummary || '',
    constraints: context.constraints || [],
    completionCriteria: context.completionCriteria || []
  };
}

async function readMemoryFile(memoryFile) {
  try {
    const raw = await fs.readFile(memoryFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: 1, updatedAt: '', contexts: {} };
  }
}

function findReusableContextId(memory, repoKey, branch) {
  const now = Date.now();
  for (const [contextId, entry] of Object.entries(memory.contexts || {})) {
    if (entry.repoKey !== repoKey) continue;
    if (entry.branch !== branch) continue;
    const updatedAt = Date.parse(entry.updatedAt || 0);
    if (!updatedAt || now - updatedAt > CONTEXT_REUSE_WINDOW_MS) continue;
    return contextId;
  }
  return '';
}

function buildSummary(reply, parsed) {
  const text = String(parsed?.summary || reply || '').trim();
  return text.length <= 500 ? text : `${text.slice(0, 497)}...`;
}

function trimHistory(history) {
  return history.slice(-5);
}

function buildDecisionEntry({ prompt, summary, parsed }) {
  return {
    timestamp: new Date().toISOString(),
    status: parsed?.payload?.status || parsed?.plan || '',
    prompt,
    summary
  };
}

function trimDecisionHistory(history) {
  return history.slice(-5);
}
