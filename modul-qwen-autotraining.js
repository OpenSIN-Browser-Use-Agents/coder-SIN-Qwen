import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildContext } from './context.js';
import { runQwenSession } from './browser.js';
import { hydrateConsultContext, persistConsultMemory } from './consult-memory.js';
import { parseQwenResponse } from './parser.js';
import { validateConsultResponse } from './validator.js';

const DEFAULT_AUTOTRAINING_FILE = '.omo-sin-qwen-autotraining.jsonl';

export async function runAutotrainingCycle({ prompt, maxTurns = 1, sessionTimeoutMs = Number(process.env.SIN_OMO_QWEN_SESSION_TIMEOUT_MS || 180_000) }) {
  // Qwen-first autotraining flow: consult, validate, snapshot, suggest, persist.
  const baseContext = await buildContext({ prompt });
  const { context, consultMeta } = await hydrateConsultContext(baseContext, prompt);
  const reply = await withTimeout(
    runQwenSession(context, { maxTurns, originalPrompt: prompt }),
    sessionTimeoutMs,
    `Qwen session timed out after ${sessionTimeoutMs}ms`
  );
  const parsed = parseQwenResponse(reply);
  const review = validateConsultResponse({ reply, parsed, context });
  parsed.review = review;
  await persistConsultMemory({ consultMeta, context, prompt, reply, parsed, review });

  const snapshot = buildAutotrainingSnapshot({ context, consultMeta, prompt, reply, parsed, review });
  const suggestions = buildAutotrainingSuggestions({ snapshot, parsed, review });
  await persistAutotrainingArtifacts({ snapshot, suggestions });

  return { snapshot, suggestions, parsed, review };
}

export function buildAutotrainingSnapshot({ context, consultMeta, prompt, reply, parsed, review, now = new Date().toISOString(), id = `snap_${randomUUID().slice(0, 8)}` }) {
  const outputText = String(reply || '').trim();
  return {
    id,
    ts: now,
    input: {
      role: 'user',
      content: prompt
    },
    output: {
      role: 'assistant',
      content: outputText,
      tokens: estimateTokens(outputText)
    },
    ctx: {
      repo: context.repo?.urls?.web || context.repo?.cwd || 'N/A',
      ref: context.repo?.head || 'N/A',
      branch: context.repo?.branch || 'N/A',
      context_id: consultMeta?.contextId || '',
      message_id: consultMeta?.messageId || ''
    },
    review: {
      pass: Boolean(review?.pass),
      score: Number(review?.score || 0),
      retry_action: review?.retry_action || 'accept',
      violations: review?.violations || []
    },
    metrics: {
      latency_ms: 0,
      score: Number(review?.score || 0)
    },
    references: (context.references || []).slice(0, 6),
    file_references: (context.fileReferences || []).slice(0, 8),
    constraints: context.constraints || [],
    completion_criteria: context.completionCriteria || [],
    parsed_summary: parsed?.summary || ''
  };
}

export function buildAutotrainingSuggestions({ snapshot, parsed, review, now = new Date().toISOString(), idFactory = () => `sug_${randomUUID().slice(0, 8)}` }) {
  const proposalText = review?.retry_action === 'strip_fluff'
    ? review.cleaned_text
    : String(parsed?.summary || snapshot.output.content || '').trim();

  return [{
    id: idFactory(),
    snap_id: snapshot.id,
    ts: now,
    target: 'output',
    action: review?.retry_action === 'regenerate' ? 'replace' : 'accept',
    proposal: {
      role: 'assistant',
      content: proposalText,
      tokens: estimateTokens(proposalText)
    },
    delta: {
      tokens: estimateTokens(proposalText) - snapshot.output.tokens,
      latency_ms: 0,
      score: Number(((review?.score || 0) - (snapshot.metrics?.score || 0)).toFixed(2))
    },
    confidence: Number(review?.score || 0),
    reason: review?.retry_action === 'regenerate'
      ? 'constraint_violation'
      : review?.retry_action === 'strip_fluff'
        ? 'fluff_reduction'
        : 'accept'
  }];
}

export async function persistAutotrainingArtifacts({ snapshot, suggestions }) {
  const filePath = resolveAutotrainingFile();
  const lines = [
    JSON.stringify({ type: 'snapshot', payload: snapshot }),
    ...suggestions.map((suggestion) => JSON.stringify({ type: 'suggestion', payload: suggestion }))
  ].join('\n') + '\n';
  await fs.appendFile(filePath, lines, 'utf8');
}

export function resolveAutotrainingFile() {
  return process.env.SIN_OMO_QWEN_AUTOTRAINING_FILE || path.join(process.cwd(), DEFAULT_AUTOTRAINING_FILE);
}

function estimateTokens(text) {
  const words = String(text || '').trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]);
}
