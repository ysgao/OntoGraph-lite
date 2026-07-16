import type { Command } from 'commander';
import { runParse } from './commands/core/parseCommand';
import { runSearch } from './commands/core/searchCommand';
import { runValidate } from './commands/core/validateCommand';
import { runConvert } from './commands/core/convertCommand';
import { runStats } from './commands/core/statsCommand';
import { runEntityInfo } from './commands/core/entityInfoCommand';

/**
 * Registers the six file-based commands (`parse`, `search`, `validate`, `convert`, `stats`,
 * `entity-info`) shared between the minimal CLI (`cli/`) and the standalone CLI
 * (`cli-standalone/`). This is the single source both packages call — a command added here
 * automatically appears in both, satisfying spec 028's FR-012 command-parity requirement
 * structurally rather than by convention.
 */
export function registerCoreCommands(program: Command): void {
  program
    .command('parse <file>')
    .description('Parse an OWL file and return a structural summary as JSON')
    .action(async (file: string) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runParse(file, timeout);
    });

  program
    .command('search <file> <query>')
    .description('Search entities in an OWL file by label or IRI substring')
    .option('--limit <n>', 'maximum results', '20')
    .option('--type <type>', 'filter by entity type: class|objectProperty|dataProperty|annotationProperty|individual')
    .action(async (file: string, query: string, opts: { limit: string; type?: string }) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runSearch(file, query, Number(opts.limit), opts.type, timeout);
    });

  program
    .command('validate <file>')
    .description('Validate an OWL file for structural errors and warnings')
    .action(async (file: string) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runValidate(file, timeout);
    });

  program
    .command('convert <file>')
    .description('Convert an OWL file to a different format')
    .requiredOption('--to <format>', 'target format: functional|manchester|turtle|owlxml')
    .option('--out <path>', 'output file path (default: same directory as source)')
    .action(async (file: string, opts: { to: string; out?: string }) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runConvert(file, opts.to, opts.out, timeout);
    });

  program
    .command('stats <file>')
    .description('Analyze ontology structure and return comprehensive statistics as JSON')
    .action(async (file: string) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runStats(file, timeout);
    });

  program
    .command('entity-info <file> <iriOrLabel>')
    .description('Get full details for a specific entity by IRI or exact label (case-insensitive)')
    .action(async (file: string, iriOrLabel: string) => {
      const timeout = Number(program.opts().timeout);
      process.exitCode = await runEntityInfo(file, iriOrLabel, timeout);
    });
}
