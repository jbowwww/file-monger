import yargs from "yargs"
import * as db from '../db';

export interface DbCommandArgv {
    db: string
}

export default {
    command: 'db [path]',
    description: 'Database commands',
    builder: (yargs: yargs.Argv<DbCommandArgv>) => yargs
        .command(
            'init',
            'Initialise database',
            yargs => yargs,
            async argv => await db.runCommand(argv.db, {}, async db => {
                // init db
            })
        )
}