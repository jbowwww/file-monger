pipeBuilder(pipe => pipe.async(
    async ({ path }) => ({ stats: await nodeFs.stat(path) }),
    async ({ path, stats }) => {
        if (stats.isDirectory()) {
            pipe.write(({ path, stats, type: 'dir' }));
        } else {
            return ({ path, stats, type: 'file', hash: await calculateHash(path) });
        }
    },


)