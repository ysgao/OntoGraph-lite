import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerCoreCommands } from '../src/registerCoreCommands';

describe('registerCoreCommands', () => {
  it('registers exactly the six shared file-based commands', () => {
    const program = new Command();
    registerCoreCommands(program);

    const names = program.commands.map(c => c.name()).sort();
    expect(names).toEqual(['convert', 'entity-info', 'parse', 'search', 'stats', 'validate']);
  });

  it('search retains its --limit/--type options', () => {
    const program = new Command();
    registerCoreCommands(program);

    const search = program.commands.find(c => c.name() === 'search')!;
    const optionNames = search.options.map(o => o.long);
    expect(optionNames).toContain('--limit');
    expect(optionNames).toContain('--type');
  });

  it('convert retains its required --to and optional --out options', () => {
    const program = new Command();
    registerCoreCommands(program);

    const convert = program.commands.find(c => c.name() === 'convert')!;
    const optionNames = convert.options.map(o => o.long);
    expect(optionNames).toContain('--to');
    expect(optionNames).toContain('--out');
  });
});
