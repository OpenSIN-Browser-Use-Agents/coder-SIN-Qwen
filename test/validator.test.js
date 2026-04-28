import test from 'node:test';
import assert from 'node:assert/strict';
import { stripFluff, validateConsultResponse } from '../packages/qwen-core/validator.js';

test('accepts concise repo-aware guidance', () => {
  const review = validateConsultResponse({
    reply: 'Run node ./verify.js, then commit the validated working tree.',
    parsed: { plan: 'freeform' },
    context: {
      completionCriteria: ['Return production-ready output only.'],
      constraints: ['Use the provided repo and file URLs when code context matters.']
    }
  });

  assert.equal(review.pass, true);
  assert.equal(review.retry_action, 'accept');
});

test('flags fluff-heavy answers for stripping', () => {
  const review = validateConsultResponse({
    reply: 'Sure, you can simply run verify next.',
    parsed: { plan: 'freeform' },
    context: {
      completionCriteria: ['Return production-ready output only.'],
      constraints: []
    }
  });

  assert.equal(review.retry_action, 'strip_fluff');
  assert.ok(review.cleaned_text.includes('run verify next'));
});

test('fails repo-access denial when repo context exists', () => {
  const review = validateConsultResponse({
    reply: 'I cannot access the repository, so I cannot inspect the files.',
    parsed: { plan: 'freeform' },
    context: {
      completionCriteria: ['Keep the recommendation aligned with the current repo state.'],
      constraints: ['Use the provided repo and file URLs when code context matters.']
    }
  });

  assert.equal(review.pass, false);
  assert.equal(review.retry_action, 'regenerate');
  assert.ok(review.violations.some((entry) => entry.rule === 'repo_access_denial'));
});

test('fails completion soft timeouts and malformed replies', () => {
  const review = validateConsultResponse({
    reply: 'bash\n1\n2\nnpm test -- test/wait-for-completion.test.js\nnpm run verify',
    parsed: { plan: 'freeform' },
    context: {
      completionCriteria: ['Return production-ready output only.'],
      constraints: []
    },
    completion: {
      status: 'soft_timeout',
      softTimeout: true,
      source: 'completion_wait',
      note: 'Stable reply wait exceeded limit'
    }
  });

  assert.equal(review.pass, false);
  assert.equal(review.retry_action, 'regenerate');
  assert.ok(review.violations.some((entry) => entry.rule === 'completion_timeout'));
});

test('stripFluff removes boilerplate filler', () => {
  const cleaned = stripFluff('Sure, as an AI language model, I hope this helps.');
  assert.equal(cleaned.length > 0, true);
  assert.equal(cleaned.includes('AI language model'), false);
});
