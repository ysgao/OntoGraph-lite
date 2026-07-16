import { Command } from 'commander';
import { registerCoreCommands } from '@cli/registerCoreCommands';
import { runStandaloneClassify } from './commands/standaloneClassifyCommand';
import { runStandaloneConsistency } from './commands/standaloneConsistencyCommand';
import { runStandaloneDlQuery } from './commands/standaloneDlQueryCommand';

const program = new Command();

program
  .name('ontograph')
  .description('OntoGraph standalone CLI — bundled-runtime OWL ontology reasoning, zero external dependencies')
  .version('0.3.4')
  .option('--timeout <ms>', 'operation timeout in milliseconds', '30000')
  .exitOverride()
  .action(() => {
    program.outputHelp();
    process.exitCode = 1;
  });

registerCoreCommands(program);

program
  .command('classify <file>')
  .description('Classify a local ontology file using this package\'s own bundled runtime — no VS Code, no system Java')
  .option('--reasoner <name>', 'reasoner engine to use. Values: hermit, elk, auto (auto picks by ontology size)', 'elk')
  .action(async (file: string, opts: { reasoner: string }) => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runStandaloneClassify(file, timeout, { reasoner: opts.reasoner });
  });

program
  .command('check-consistency <file>')
  .description('Check consistency of a local ontology file using this package\'s own bundled runtime')
  .action(async (file: string) => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runStandaloneConsistency(file, timeout);
  });

program
  .command('dl-query <file> <expression>')
  .description('Run a DL query against a local ontology file using this package\'s own bundled runtime')
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
just shell quoting and don't do this for you. Auto-classifies first if the
ontology hasn't been classified yet.

Examples:
  $ ontograph dl-query ./ontology.omn "'Body structure' and ('all or part of' some Liver)"
  $ ontograph dl-query ./ontology.omn "Pizza" --types subClasses,instances
  $ ontograph dl-query ./ontology.omn "Pizza" --types subClasses --filter margherita
`)
  .action(async (file: string, expression: string, opts: { types?: string; filter?: string }) => {
    const timeout = Number(program.opts().timeout);
    process.exitCode = await runStandaloneDlQuery(file, expression, timeout, { types: opts.types, filter: opts.filter });
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  process.exit(1);
});
