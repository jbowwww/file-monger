import * as mongo from 'mongodb';

export function getMockDb() {
    return {
        collection<T>(name: string) {
            return ({
                findOne(filter: any) {
                    return null;
                },
                updateOne(filter: any, update: any, options: any) {
                    return null;
                }
            });
        }
    }
}

export async function runCommand(url: string, options: mongo.MongoClientOptions = {}, command: (db: mongo.Db) => Promise<void>) {
    const client = new mongo.MongoClient(url, options);
    const connection = await client.connect();
    const db = connection.db();
    try {
        await command(db as unknown as mongo.Db);
    } catch (err) {
        throw err;
    } finally {
        await client.close();
    }
}
