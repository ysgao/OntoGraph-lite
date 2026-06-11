import { Command } from 'commander';
import { runParse } from './commands/core/parseCommand';
import { runSearch } from './commands/core/searchCommand';
import { runValidate } from './commands/core/validateCommand';
import { runConvert } from './commands/core/convertCommand';
import { runClassify } from './commands/bridge/classifyCommand';
import { runCheckConsistency } from './commands/bridge/consistencyCommand';
import { runDlQuery } from './commands/bridge/dlQueryCommand';

const program = new Command();

program
  .name('ontograph')
  .description('OntoGraph CLI — OWL ontology operations for AI tools and developers')
  .version('0.1.0')
  .option('--timeout <ms>', 'operation timeout in milliseconds', '30000')
  .exitOverride()
  .action(() => {
    program.outputHelp();
    process.exitCode = 1;
  });

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
  .command('classify')
  .description('Classify the active ontology via the running OntoGraph extension')
  .action(async () => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runClassify(timeout);
  });

program
  .command('check-consistency')
  .description('Check consistency of the active ontology via the running OntoGraph extension')
  .action(async () => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runCheckConsistency(timeout);
  });

program
  .command('dl-query <expression>')
  .description('Run a DL query against the active ontology via the running OntoGraph extension')
  .action(async (expression: string) => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runDlQuery(expression, timeout);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  process.exit(1);
});
