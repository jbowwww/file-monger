#!/usr/bin/env node
import process from 'process';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

export const globalOptions = {
  dbUrl: {
    description: 'Path to database',
    demandOption: true,
    default: "mongodb://localhost:27017/"
  }
};

var argv = yargs(hideBin(process.argv))
  .scriptName('cli')
  .options(globalOptions)
  .commandDir('cmds')
  .demandCommand()
  .help()
  .parse();

console.log(`argv = ${JSON.stringify(argv)}`);
