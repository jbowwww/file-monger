#!/usr/bin/env node
import process from 'process';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

yargs(hideBin(process.argv))
  .option('db', {
    desc: 'Path to the database to initialise',
    type: 'string',
    demandOption: true,
    default: './db'
  })
  .commandDir('cmds')
  .help()
  .completion()
  .parse();

// if .commandDir() doesn't work out suitably:
//
//.command('init',
//   'Initialise the database',
//   yargs => yargs,
//   async argv => {
//     db.init(argv);
//   })
// .command('summary',
//   'Summarise the database',
//   yargs => yargs,
//   argv => {

//   })
// .command('index <path>',
//   'Index a file',
//   yargs => yargs
//     .positional('path', {
//       desc: 'Path of file to index',
//     }),
//   argv => {

//   })