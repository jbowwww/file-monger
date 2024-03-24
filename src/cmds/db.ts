import yargs from "yargs"
import * as db from '../db';

export interface DbCommandArgv {
    dbUrl: string
}

exports.command = 'db';
exports.description = 'Database commands';
exports.builder = function (yargs: yargs.Argv<DbCommandArgv>) {
    yargs.command('init', 'Initialise database', yargs => { }, async argv => {
        console.log(`init db argv=${JSON.stringify(argv)}`);
        await db.useConnection(argv.dbUrl, {}, async connection => {

        });
    })
    yargs.demandCommand();
};

