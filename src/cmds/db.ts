import yargs, { ArgumentsCamelCase } from "yargs";
// import * as db from '../db';

export interface DbCommandArgv {
    dbUrl: string;
}

exports.command = 'db';
exports.description = 'Database commands';
exports.builder = (yargs: yargs.Argv) => yargs
    .command('init', 'Initialise database', yargs => { }, async argv => {
        console.log(`init db argv=${JSON.stringify(argv)}`);
        // await db.collection(argv.dbUrl, {}, File, 'files', async collection => { // });
    })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase<DbCommandArgv>) {
    console.log(`cmds/db handler argv=${JSON.stringify(argv)}`);
    // await db.connect(argv.dbUrl, {});
};
