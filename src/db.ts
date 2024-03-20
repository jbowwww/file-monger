import mongo from 'mongodb';

export async function runCommand(url: string, options: mongo.MongoClientOptions = {}, command: (db: mongo.MongoClient) => Promise<void>) {
    const client = new mongo.MongoClient(url, options);
    const db = await client.connect();
    try {
        command(db);
    } catch (err) {
        throw err;
    } finally {
        await db.close();
    }
}
