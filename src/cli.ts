#!/usr/bin/env node
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

export const globalOptions = {
    dbUrl: {
        description: "Path to database",
        demandOption: true,
        default: "mongodb://mongo:mongo@127.0.0.1:27017/test?directConnection=true&replicaSet=rs0&authSource=admin", // const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@mongo-database/${process.env.DB_NAME}?retryWrites=true&writeConcern=majority&authSource=admin`;
        global: true,
    }
};

var argv = yargs(hideBin(process.argv))
    .scriptName("cli")
    .option(globalOptions)
    .middleware(async argv => { console.log(`cli middleware argv=${JSON.stringify(argv)}`); })
    .commandDir("cmds")
    .demandCommand()
    .help("help", "Help", true)
    .parse();
