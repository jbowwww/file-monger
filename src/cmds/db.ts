import yargs, { ArgumentsCamelCase } from "yargs";

import debug from "debug";
import * as nodePath from "node:path";
const log = debug(nodePath.basename(module.filename));

export interface DbCommandArgv {
    dbUrl: string;
}

exports.command = 'db';
exports.description = 'Database commands';
exports.builder = (yargs: yargs.Argv) => yargs
    .command('init', 'Initialise database', yargs => { }, async argv => {
        log("init db argv=%O", argv);
        // await db.collection(argv.dbUrl, {}, File, 'files', async collection => { // });
    })
    .demandCommand();
exports.handler = async function (argv: ArgumentsCamelCase<DbCommandArgv>) {
    log("cmds/db handler argv=%O", argv);
    // await db.connect(argv.dbUrl, {});
};
