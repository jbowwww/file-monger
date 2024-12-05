#!/usr/bin/env node
import process from 'process';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import * as db from './db';

export const globalOptions = {
  dbUrl: {
      description: 'Path to database',
      demandOption: true,
      default: "mongodb://mongo:mongo@localhost:27017/",
      global: true,
  }
};

var argv = yargs(hideBin(process.argv))
  .scriptName('cli')
  .option(globalOptions)
  .middleware(async argv => {
      console.log(`cli middleware argv=${JSON.stringify(argv)}`);
      await db.configure(() => new db.MongoStorage(argv.dbUrl, {}));
  })
  .commandDir('cmds')
  .demandCommand()
  .help("help", "Help", true)
  .parse();
