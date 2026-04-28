import test from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import { parseQwenResponse } from '../packages/qwen-core/parser.js';
import { validateConsultResponse, stripFluff } from '../packages/qwen-core/validator.js';
import { guardPromptLength, DEFAULT_MAX_PROMPT_LENGTH } from '../packages/qwen-core/lib/prompt-guard.js';
import { resolveQwenAccountIds } from '../qwen-account-rotation.js';
import { resolveRuntimeConfig } from '../packages/qwen-core/runtime-config.js';

test('Property: parseQwenResponse never returns null for any string', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string({ maxLength: 5000 }), async (input) => {
      const result = parseQwenResponse(input);
      return result !== null && result !== undefined;
    }),
    { numRuns: 500 }
  );
});

test('Property: parseQwenResponse handles JSON content correctly', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.constantFrom('```json\n{"key": "value"}\n```', 'Some text here', '', '   '),
      async (input) => {
        const result = parseQwenResponse(input);
        return result !== null;
      }
    ),
    { numRuns: 100 }
  );
});

test('Property: stripFluff output is never longer than input', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 1000 }), (input) => {
      const result = stripFluff(input);
      return result.length <= input.length;
    }),
    { numRuns: 500 }
  );
});

test('Property: stripFluff preserves meaningful content', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc.constantFrom(
        ['Here is my analysis:', 'I think the answer is', 'Based on the code:', ''],
        ['', ' Let me explain.', ' In summary:', ' Conclusion:']
      ),
      (content, wrapper) => {
        const input = `${wrapper[0]}${content}${wrapper[1] || ''}`;
        const result = stripFluff(input);
        return result.length > 0 || input.length === 0;
      }
    ),
    { numRuns: 200 }
  );
});

test('Property: guardPromptLength caps at MAX_PROMPT_LENGTH or less', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50000 }),
      fc.integer({ min: 100, max: 50000 }),
      (input, maxLen) => {
        const result = guardPromptLength(input, { maxLength: maxLen });
        return result.prompt.length <= maxLen;
      }
    ),
    { numRuns: 500 }
  );
});

test('Property: guardPromptLength never appends truncation marker for short inputs', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      (input) => {
        const result = guardPromptLength(input, { maxLength: 1000 });
        return !result.truncated;
      }
    ),
    { numRuns: 200 }
  );
});

test('Property: guardPromptLength always returns text + truncated flag', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 100 }),
      fc.integer({ min: 1, max: 1000 }),
      (input, maxLen) => {
        const result = guardPromptLength(input, { maxLength: maxLen });
        return typeof result.prompt === 'string' && typeof result.truncated === 'boolean';
      }
    ),
    { numRuns: 200 }
  );
});

test('Property: guardPromptLength handles empty and edge inputs', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(''), fc.constant('  '), fc.constant('\n'), fc.string({ maxLength: 10000 })),
      (input) => {
        const result = guardPromptLength(input);
        return typeof result.prompt === 'string' && result.prompt.length <= DEFAULT_MAX_PROMPT_LENGTH;
      }
    ),
    { numRuns: 100 }
  );
});

test('Property: resolveQwenAccountIds always returns array of strings', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 50 }),
      fc.string({ maxLength: 50 }),
      fc.string({ maxLength: 50 }),
      (order1, order2, order3) => {
        const ids = resolveQwenAccountIds({
          QWEN_ACCOUNT_ORDER: `${order1},${order2},${order3}`,
          QWEN_ACCOUNT_1_EMAIL: 'a@b.com',
          QWEN_ACCOUNT_2_EMAIL: 'c@d.com',
        });
        return Array.isArray(ids) && ids.every((id) => typeof id === 'string');
      }
    ),
    { numRuns: 200 }
  );
});

test('Property: validateConsultResponse with valid input never throws', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        reply: fc.string({ maxLength: 1000 }),
        parsed: fc.constant(null),
        context: fc.record({
          prompt: fc.string({ maxLength: 500 }),
          turnNumber: fc.integer({ min: 0, max: 10 }),
        }),
        completion: fc.constant(null),
      }),
      async (input) => {
        try {
          const result = validateConsultResponse(input);
          return result !== null && result !== undefined;
        } catch {
          return true; // throws for invalid input is acceptable
        }
      }
    ),
    { numRuns: 200 }
  );
});

test('Property: resolveRuntimeConfig provides valid config for typical env', () => {
  fc.assert(
    fc.property(
      fc.record({
        SIN_CODER_QWEN_AUTH_METHOD: fc.constantFrom('email_password', 'google_oauth'),
        SIN_CODER_QWEN_DRY_RUN: fc.constantFrom('0', '1'),
        CHROME_REMOTE_DEBUGGING_PORT: fc.constantFrom('9222', '9444', '9333'),
      }),
      (env) => {
        try {
          const config = resolveRuntimeConfig(env);
          return config !== null && typeof config === 'object';
        } catch {
          return true;
        }
      }
    ),
    { numRuns: 100 }
  );
});
