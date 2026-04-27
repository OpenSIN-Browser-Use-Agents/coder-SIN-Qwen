import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWriteJson } from './lib/memory-writer.js';
import { APP_NAME, getScopedEnv } from './runtime-config.js';
import { installTraceContext, readTraceContext } from './trace.js';

const DEFAULT_MEMORY_FILE = '.coder-sin-qwen-memory.json';

export async function hydrateConsultContext(baseContext, prompt) {
  if (typeof baseContext === 'string') {
    return {
      context: baseContext,
      consultMeta: null
    };
  }

  const trace = installTraceContext(process.env);
  const memoryFile = resolveMemoryFile();
  const memory = await readMemoryFile(memoryFile);
  const repoKey = baseContext.repo?.urls?.web || baseContext.repo?.cwd || 'unknown-repo';
  const branch = baseContext.repo?.branch || 'N/A';
  const sessionId = String(trace.sessionId || trace.runId || randomUUID()).trim();
  const contextId = sessionId;
  const previousEntry = memory.contexts?.[contextId] || null;
  const messageId = randomUUID();

  const stateSnapshot = buildStateSnapshot(baseContext, {
    contextId,
    sessionId,
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
      sessionId,
      contextId,
      messageId,
      previousMessageId: previousEntry?.lastMessageId || ''
    }
  };
}

export async function persistConsultMemory({ consultMeta, context, prompt, reply, parsed, review }) {
  if (!consultMeta || typeof context === 'string') return;

  const memory = await readMemoryFile(consultMeta.memoryFile);
  const summary = buildSummary(reply, parsed);
  const previousEntry = memory.contexts?.[consultMeta.contextId] || {};
  const decisionEntry = buildDecisionEntry({ prompt, summary, parsed });
  const contextEntry = {
    repoKey: consultMeta.repoKey,
    sessionId: consultMeta.sessionId || consultMeta.contextId || '',
    repoUrl: context.repo?.urls?.web || '',
    branch: context.repo?.branch || 'N/A',
    head: context.repo?.head || 'N/A',
    dirty: Boolean(context.repo?.dirty),
    updatedAt: new Date().toISOString(),
    trace: readTraceContext(),
    lastMessageId: consultMeta.messageId,
    previousMessageId: consultMeta.previousMessageId || '',
    latestPrompt: prompt,
    latestSummary: summary,
    latestStatus: parsed?.payload?.status || '',
    latestDecision: decisionEntry,
    latestReview: review || null,
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

  await atomicWriteJson(consultMeta.memoryFile, nextMemory);
}

export function resolveMemoryFile() {
  return getScopedEnv('MEMORY_FILE', path.join(process.cwd(), DEFAULT_MEMORY_FILE));
}

export function buildStateSnapshot(context, meta) {
  return {
    protocolVersion: 'A2A-v2.1-lite',
    messageId: meta.messageId,
    metadata: {
      sender: APP_NAME,
      receiver: 'Qwen',
      timestamp: new Date().toISOString(),
      contextId: meta.contextId,
      sessionId: meta.sessionId || meta.contextId || '',
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
      trace: readTraceContext(),
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
