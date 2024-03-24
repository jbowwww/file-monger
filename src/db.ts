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
            }) as unknown as mongo.Db;
        }
    }
}

export async function connect(url: string, options: mongo.MongoClientOptions = {}) {
    const client = new mongo.MongoClient(url, options);
    const connection = await client.connect();
    return connection;
}

export async function useConnection(url: string, options: mongo.MongoClientOptions = {}, command: (db: mongo.MongoClient) => Promise<void>) {
    const connection = await connect(url, options);
    try {
        await command(connection);
    } catch (err) {
        throw err;
    } finally {
        await connection.close();
    }
}
