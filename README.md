# RUNNING

## DB in docker

Boot up the docker-compose for the MongoDB instance replicaset. May need some configuration to initialise the replSet without the ./docker/data/db directory. See docker/NOTES.md.

## Executing

Currently testing (linux) with:

```bash
clear ; reset ; DEBUG=* npm run start file index ./package.json --trace-promises
```
