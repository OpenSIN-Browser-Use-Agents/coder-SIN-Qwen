import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBudgetManager, createTokenBudgetManager, CATEGORY_BUDGET } from '../packages/qwen-core/lib/token-budget.js';
import { RelevanceScorer, createRelevanceScorer } from '../packages/qwen-core/lib/relevance-scorer.js';
import { ContextCompressor, createContextCompressor } from '../packages/qwen-core/lib/context-compressor.js';

test('CATEGORY_BUDGET has 6 categories summing to 100%', () => {
  const total = Object.values(CATEGORY_BUDGET).reduce((s, c) => s + c.ratio, 0);
  assert.equal(total, 1.0);
});

test('TokenBudgetManager allocates budgets by ratio', () => {
  const mgr = new TokenBudgetManager({ maxLength: 10000 });
  const budgets = mgr.getAllBudgets();
  assert.equal(budgets.instructions, 2500);
  assert.equal(budgets.code, 3500);
  assert.equal(budgets.repo, 1500);
  assert.equal(budgets.reserve, 500);
});

test('TokenBudgetManager.render truncates oversized content', () => {
  const mgr = new TokenBudgetManager({ maxLength: 100 });
  const result = mgr.render('instructions', 'a'.repeat(50));
  assert.equal(result.length, 25);
  assert.ok(result.endsWith('...'));
});

test('TokenBudgetManager.render passes small content through', () => {
  const mgr = new TokenBudgetManager({ maxLength: 1000 });
  const result = mgr.render('instructions', 'hello world');
  assert.equal(result, 'hello world');
});

test('TokenBudgetManager.render returns empty for unknown category', () => {
  const mgr = new TokenBudgetManager();
  assert.equal(mgr.render('nonexistent', 'test'), '');
});

test('TokenBudgetManager.renderAll handles empty sections', () => {
  const mgr = new TokenBudgetManager();
  assert.equal(mgr.renderAll({}), '');
});

test('TokenBudgetManager.oversize detects oversize', () => {
  const mgr = new TokenBudgetManager({ maxLength: 100 });
  assert.equal(mgr.oversize({ code: 'a'.repeat(200) }), true);
  assert.equal(mgr.oversize({ code: 'hello' }), false);
});

test('TokenBudgetManager.maxLength returns configured value', () => {
  const mgr = new TokenBudgetManager({ maxLength: 5000 });
  assert.equal(mgr.maxLength, 5000);
});

test('createTokenBudgetManager is factory', () => {
  const mgr = createTokenBudgetManager();
  assert.ok(mgr instanceof TokenBudgetManager);
});

test('RelevanceScorer scores documents by relevance to query', () => {
  const scorer = new RelevanceScorer();
  const result = scorer.scoreDocument('implement login auth', {
    name: 'auth.js',
    content: 'function login() { /* auth */ }',
  });
  assert.ok(typeof result.score === 'number');
  assert.ok(result.score >= 0);
});

test('RelevanceScorer gives higher score for matching documents', () => {
  const scorer = new RelevanceScorer();
  const match = scorer.scoreDocument('login auth', {
    name: 'auth.js',
    content: 'login function for user authentication',
  });
  const noMatch = scorer.scoreDocument('login auth', {
    name: 'readme.md',
    content: 'installation instructions for the project',
  });
  assert.ok(match.score >= noMatch.score);
});

test('RelevanceScorer.rank returns top N documents', () => {
  const scorer = new RelevanceScorer();
  const docs = [
    { name: 'a.js', content: 'login auth' },
    { name: 'b.js', content: 'other stuff' },
    { name: 'c.js', content: 'more login' },
  ];
  const result = scorer.rank('login', docs, 2);
  assert.equal(result.kept, 2);
  assert.equal(result.total, 3);
  assert.equal(result.dropped, 1);
  assert.ok(result.ranked.length <= 2);
});

test('RelevanceScorer.filterIrrelevant removes low scores', () => {
  const scorer = new RelevanceScorer();
  const docs = [
    { name: 'login.js', content: 'login function' },
    { name: 'colors.css', content: 'color scheme' },
  ];
  const filtered = scorer.filterIrrelevant('login', docs, 0.1);
  assert.ok(filtered.length <= 2);
});

test('createRelevanceScorer is factory', () => {
  const scorer = createRelevanceScorer();
  assert.ok(scorer instanceof RelevanceScorer);
});

test('ContextCompressor.compress returns original when under budget', () => {
  const comp = new ContextCompressor({ maxLength: 10000 });
  const result = comp.compress('test', { code: 'hello world' });
  assert.equal(result.truncated, false);
  assert.equal(result.compressed, 'hello world');
});

test('ContextCompressor.compress truncates when over budget', () => {
  const comp = new ContextCompressor({ maxLength: 100 });
  const result = comp.compress('test', { code: 'a'.repeat(500), instructions: 'b'.repeat(500) });
  assert.equal(result.truncated, true);
  assert.ok(result.compressed.length < 500, 'must be shorter than original');
  assert.ok(result.compressed.includes('...'), 'must show truncation marker');
});

test('ContextCompressor.compress tracks sizes', () => {
  const comp = new ContextCompressor({ maxLength: 10000 });
  const result = comp.compress('test', { code: 'hello' });
  assert.equal(result.originalSize, 5);
  assert.ok(result.compressedSize > 0);
});

test('ContextCompressor.compressWithRanking returns ranked docs', () => {
  const comp = new ContextCompressor({ maxLength: 10000 });
  const result = comp.compressWithRanking('login', { instructions: 'implement login' }, [
    { name: 'auth.js', content: 'login function' },
  ]);
  assert.ok(result.rankedDocs);
  assert.equal(result.rankedDocs.total, 1);
});

test('createContextCompressor is factory', () => {
  const comp = createContextCompressor();
  assert.ok(comp instanceof ContextCompressor);
});
