#!/usr/bin/env node
import process from 'process';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { globalOptions } from './cmds/db';
import * as db from './db';

  var argv = yargs(hideBin(process.argv))
  .scriptName('cli')
  .option(globalOptions)
  .middleware(async argv => {
      console.log(`cli middleware argv=${JSON.stringify(argv)}`);
      await db.connect(argv.dbUrl);
  })
  .commandDir('cmds')
  // .onFinishCommand(async (result: any) => {
  //     console.log(`cmds/db builder onFinishCommand result=${JSON.stringify(result)}`);
  //     await db.close();
  // })
  .demandCommand()
  .help()
  .parseAsync();

// console.log(`argv = ${JSON.stringify(argv)}`);

// db.close();