import type { Command } from 'commander';
import { runParse } from './commands/core/parseCommand';
import { runSearch } from './commands/core/searchCommand';
import { runValidate } from './commands/core/validateCommand';
import { runConvert } from './commands/core/convertCommand';
import { runStats } from './commands/core/statsCommand';
import { runEntityInfo } from './commands/core/entityInfoCommand';
import { resolveActiveFilePath } from './bridge/activeFile';
import { writeError, exitCode } from './output';

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
    .command('search <args...>')
    .description('Search entities in an OWL file by label or IRI substring')
    .option('--limit <n>', 'maximum number of results to return', '20')
    .option(
      '--type <type>',
      'filter results to one entity type. Values: class, objectProperty, dataProperty, annotationProperty, individual',
    )
    .addHelpText('after', `
Usage:
  $ ontograph search <file> <query>
  $ ontograph search <query>              (uses the ontology open in VS Code)

If <file> is omitted, it is resolved from the ontology file currently open in
the running OntoGraph extension (same fallback as entity-info).

Examples:
  $ ontograph search ./ontology.omn "Finding site"
  $ ontograph search ./ontology.owl "Body structure" --type class --limit 10
  $ ontograph search "hasTopping" --type objectProperty
`)
    .action(async (args: string[], opts: { limit: string; type?: string }) => {
      const start = Date.now();
      const command = 'search';
      const timeout = Number(program.opts().timeout);

      if (args.length < 1 || args.length > 2) {
        writeError('INVALID_ARGS', 'Usage: search [file] <query>', command, Date.now() - start);
        process.exitCode = exitCode('INVALID_ARGS');
        return;
      }
      const file = args.length === 2 ? args[0] : undefined;
      const query = args.length === 2 ? args[1] : args[0];

      try {
        const resolvedFile = file ?? await resolveActiveFilePath(timeout);
        process.exitCode = await runSearch(resolvedFile, query, Number(opts.limit), opts.type, timeout);
      } catch (err: unknown) {
        const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
        const msg = err instanceof Error ? err.message : String(err);
        writeError(code, msg, command, Date.now() - start);
        process.exitCode = exitCode(code);
      }
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
    .requiredOption('--to <format>', 'target format. Values: functional, manchester, turtle, owlxml')
    .option('--out <path>', 'output file path (default: same directory as source)')
    .addHelpText('after', `
Examples:
  $ ontograph convert ./ontology.omn --to functional
  $ ontograph convert ./ontology.omn --to turtle --out ./ontology.ttl
`)
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
    .command('entity-info <args...>')
    .description('Get full details for a specific entity by IRI or exact label (case-insensitive)')
    .addHelpText('after', `
Usage:
  $ ontograph entity-info <file> <iriOrLabel>
  $ ontograph entity-info <iriOrLabel>    (uses the ontology open in VS Code)

<iriOrLabel> is resolved, in order: full IRI, bare local name (e.g. "Koala" for
.../animals#Koala), then exact label/prefLabel/altLabel (case-insensitive). If
<file> is omitted, it is resolved from the ontology file currently open in the
running OntoGraph extension (same fallback as search).

Examples:
  $ ontograph entity-info ./ontology.ofn "http://example.org/animals#Koala"
  $ ontograph entity-info ./snomed.owl Koala
  $ ontograph entity-info "Middle ear structure"
`)
    .action(async (args: string[]) => {
      const start = Date.now();
      const command = 'entity-info';
      const timeout = Number(program.opts().timeout);

      if (args.length < 1 || args.length > 2) {
        writeError('INVALID_ARGS', 'Usage: entity-info [file] <iriOrLabel>', command, Date.now() - start);
        process.exitCode = exitCode('INVALID_ARGS');
        return;
      }
      const file = args.length === 2 ? args[0] : undefined;
      const iriOrLabel = args.length === 2 ? args[1] : args[0];

      try {
        const resolvedFile = file ?? await resolveActiveFilePath(timeout);
        process.exitCode = await runEntityInfo(resolvedFile, iriOrLabel, timeout);
      } catch (err: unknown) {
        const code = (err as { errorCode?: string }).errorCode ?? 'BRIDGE_ERROR';
        const msg = err instanceof Error ? err.message : String(err);
        writeError(code, msg, command, Date.now() - start);
        process.exitCode = exitCode(code);
      }
    });
}
