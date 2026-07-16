import { Command } from 'commander';
import { registerCoreCommands } from './registerCoreCommands';
import { runClassify } from './commands/bridge/classifyCommand';
import { runCheckConsistency } from './commands/bridge/consistencyCommand';
import { runDlQuery } from './commands/bridge/dlQueryCommand';

const program = new Command();

program
  .name('ontograph')
  .description('OntoGraph CLI — OWL ontology operations for AI tools and developers')
  .version('0.3.4')
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
  .option(
    '--types <list>',
    'comma-separated result categories to include. Values: directSuperClasses, superClasses, ' +
    'equivalentClasses, directSubClasses, subClasses, instances (default: subClasses)',
  )
  .option('--filter <substring>', 'case-insensitive label/IRI substring filter applied to every returned category')
  .addHelpText('after', `
<expression> is a Manchester Syntax class expression. Entity names in it may be
given as label, prefLabel, or altLabel (case-insensitive) instead of a full
IRI — resolved client-side before the query reaches the reasoner. Wrap any
multi-word entity name in single quotes so it parses as one term rather than
separate (invalid) words — the double quotes around the whole expression are
just shell quoting and don't do this for you. Requires OntoGraph active in VS
Code (auto-classifies first if the ontology hasn't been classified yet).

Examples:
  $ ontograph dl-query "'Body structure' and ('all or part of' some Liver)"
  $ ontograph dl-query "Pizza" --types subClasses,instances
  $ ontograph dl-query "Pizza" --types subClasses --filter margherita
`)
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
