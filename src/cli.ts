#!/usr/bin/env node
import * as nodePath from "node:path";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

import debug from "debug";
debug.formatters.b = (v: boolean) => !!v ? "true" : "false";
const log = debug(nodePath.basename(module.filename));

export const globalOptions = {
    dbUrl: {
        description: "Path to database",
        demandOption: true,
        default: "mongodb://mongo:mongo@127.0.0.1:27017/test?directConnection=true&replicaSet=rs0&authSource=admin",
        global: true,
    }
}

var argv = yargs(hideBin(process.argv))
    .scriptName("cli")
    .option(globalOptions)
    .commandDir("cmds")
    .demandCommand()
    .help("help", "Help", true)
    .parse();
