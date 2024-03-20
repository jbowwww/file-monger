import mongo from 'mongodb';

export async function runCommand(url: string, options: mongo.MongoClientOptions = {}, command: (db: mongo.Db) => Promise<void>) {
    const client = await mongo.MongoClient.connect(url, options);
    const db = client.db();
    try {
        command(db);
    } catch (err) {
        throw err;
    } finally {
        await client.close();
    }
}
