import crypto from 'crypto';
import fs from 'fs';

export async function calculateHash(path: string) {
    try {
        const hashDigest = crypto.createHash('sha256');
        const input = fs.createReadStream(path);
        const hash = await new Promise((resolve: (value: string) => void, reject): void => {
            input.on('close', () => resolve(hashDigest.digest('hex')));
            input.on('end', () => resolve(hashDigest.digest('hex')));
            input.on('error', () => reject(`Error hashing file '${path}'`));
            input.on('readable', () => {
                const data = input.read();
                if (data)
                    hashDigest.update(data);
            });
        });
        return hash;
    } catch (error) {
        throw new Error(`Error hashing file '${path}': ${error}`);
    }
}
