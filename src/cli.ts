#!/usr/bin/env node
import process from 'process';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

var argv = yargs(hideBin(process.argv))
  .commandDir('cmds')
  .demandCommand()
  .help()
  .parse();

console.log(`argv = ${JSON.stringify(argv)}`);
