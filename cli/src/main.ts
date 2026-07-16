import { Command } from 'commander';
import { registerCoreCommands } from './registerCoreCommands';
import { runClassify } from './commands/bridge/classifyCommand';
import { runCheckConsistency } from './commands/bridge/consistencyCommand';
import { runDlQuery } from './commands/bridge/dlQueryCommand';

const program = new Command();

program
  .name('ontograph')
  .description('OntoGraph CLI — OWL ontology operations for AI tools and developers')
  .version('0.3.2')
  .option('--timeout <ms>', 'operation timeout in milliseconds', '30000')
  .exitOverride()
  .action(() => {
    program.outputHelp();
    process.exitCode = 1;
  });

registerCoreCommands(program);

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
  .option('--types <list>', 'comma-separated result categories: directSuperClasses|superClasses|equivalentClasses|directSubClasses|subClasses|instances (default: subClasses)')
  .option('--filter <substring>', 'case-insensitive label/IRI substring filter applied to every returned category')
  .action(async (expression: string, opts: { types?: string; filter?: string }) => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runDlQuery(expression, timeout, { types: opts.types, filter: opts.filter });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  process.exit(1);
});
