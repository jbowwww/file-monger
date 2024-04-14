import yargs, { ArgumentsCamelCase } from "yargs"
import * as db from '../db';

export interface DbCommandArgv {
    dbUrl: string
}

export const globalOptions = {
    dbUrl: {
        description: 'Path to database',
        demandOption: true,
        default: "mongodb://localhost:27017/",
        global: true,
    }
};

exports.command = 'db';
exports.description = 'Database commands';

exports.builder = function (yargs: yargs.Argv<DbCommandArgv>) {

    console.log(`cmds/db builder yargs=${JSON.stringify(yargs)}`);

    yargs.option(globalOptions);

    yargs.middleware(async argv => {
        console.log(`cmds/db builder middleware argv=${JSON.stringify(argv)}`);
        await db.connect(argv.dbUrl);
    });
    yargs.onFinishCommand(async (result: any) => {
        console.log(`cmds/db builder onFinishCommand result=${JSON.stringify(result)}`);
        await db.close();
    });

    yargs.command('init', 'Initialise database', yargs => { }, async argv => {
        console.log(`init db argv=${JSON.stringify(argv)}`);
        // await db.collection(argv.dbUrl, {}, File, 'files', async collection => { // });
    });

    yargs.demandCommand();
};

exports.handler = async function (argv: ArgumentsCamelCase<DbCommandArgv>) {
    console.log(`cmds/db handler argv=${JSON.stringify(argv)}`);
    await db.connect(argv.dbUrl, {});
};
