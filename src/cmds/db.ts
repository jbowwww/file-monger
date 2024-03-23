import yargs from "yargs"
import * as db from '../db';

export interface DbCommandArgv {
    db: string
}

exports.command = 'db';
exports.description = 'Database commands';
exports.builder = function (yargs: yargs.Argv<DbCommandArgv>) {
    yargs.command('init [dbPath]', 'Initialise database', yargs => {
        yargs.positional('dbPath', {
            description: 'Path to database',
            type: 'string',
            demandOption: true,
            default: './db'
        });
    }, async argv => {
        console.log(`init db argv=${JSON.stringify(argv)}`);
        await db.runCommand(argv.db, {}, async db => {

        });
    })
    .demandCommand();
};

