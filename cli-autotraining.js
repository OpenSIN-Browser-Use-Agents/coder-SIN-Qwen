#!/usr/bin/env node
import { runAutotrainingCycle } from './modul-qwen-autotraining.js';

const argv = process.argv.slice(2);
const jsonFlag = argv.includes('--json');
const turnArgIndex = argv.indexOf('--turns');
const maxTurns = turnArgIndex >= 0 ? Number(argv[turnArgIndex + 1] || 1) : 1;
const prompt = argv.filter((arg, index) => {
  if (arg === '--json') return false;
  if (arg === '--turns') return false;
  if (turnArgIndex >= 0 && index === turnArgIndex + 1) return false;
  return !arg.startsWith('--');
}).join(' ').trim();

if (!prompt) {
  console.error('Usage: node ./cli-autotraining.js [--json] [--turns <n>] <prompt>');
  process.exit(1);
}

const result = await runAutotrainingCycle({ prompt, maxTurns });

if (jsonFlag) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`${result.snapshot.parsed_summary || result.parsed.summary || result.snapshot.output.content}\n`);
}
