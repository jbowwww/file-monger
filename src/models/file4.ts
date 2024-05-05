import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { calculateHash } from '../file';
import { BehaviorSubject, Observable, forkJoin, from, observeOn } from 'rxjs';
import { set } from 'zod';

namespace FileSystem {

/*
 * Ongoing reminder of the things I want File aspects / models /classes/modules(<-less OOP more FP?)
 *
 *  - Determine if the File (/dir too?) at its (immutable?) FS path:
 *      + (a) exists, and
 *      + (b) the time lapsed since the model (whether isNew() or loaded from Storage) was (re-)stat()'d 
 *          - (b)(ii) if new stat()'s appear to have changed (any properties from new check / re-stat() are different to DB/model)
 *          - (b)(iii) either and/or both of these values/conditions should (configurably ig?) be capable/configurable of either/and:
 *              + invalidating/flagging and/or deleting (or just Timestamping certain values/model properties that are!) certain values
 *                in the DB/model (like hash(s)(should maybe eventually use several hash/checksum algorithms)) that are
 *                  - dynamic
 *                  - "reactive"
 *                  - invalidate-able (note: this obviously implies "validation" is an important operation/aspect of this general idea/problem)
 *              + triggering re-fresh() of the values
 *                  - this inevitably requires a (very likely often async) function associated with such dynamic properties.
 *                      + getters and setters could be perfect for the job
 *                          - model could cache the result / debounce the function invocation - rewrite the model property as plain data property(&vice/versa)
 *                              + definition of and easy (re-)assigning to and from _pure data_  DB models/DTO TS _interfaces_ for each aspect model type,
 *                                even if they end up being also being actual classes with instance methods, would make for easy save/load to/from Storage
 *                                
 *
 *  */


export type Test<T = any> = (obj: T) => boolean;

export const PropertyTriggerTableSymbol = Symbol('PropertyTriggerTableSymbol');

// Generic parameter T on methods in this object is the type of the Aspect type definition e.g. File | Directory, etc
export const Aspect = <T extends object>(aspectCtor: new (...args: any[]) => T) => {
    
    return class {
        
        [PropertyTriggerTableSymbol]: {
            [K: keyof T]: {
                triggerPropertyName: string,
                triggerConditionTest: Test<T>,
            },
        } = {};

        constructor(...args: any[]) {
            const proxy = new Proxy(new aspectCtor(...args), {
                set(target: any, p: string | symbol, newValue: any, receiver: any): boolean {
                    const oldValue = target[p];
                    if (newValue === oldValue) {
                        return false;
                    } else {

                        return true;
                    }
                },
            });
            return proxy;
        }
    };

};

// decorator for specifying properties that trigger updates on the property the decorator is being applied to
Aspect.Trigger = <T extends object & { [PropertyTriggerTableSymbol]: /* & Function */>(triggerPropertyName: string | symbol, triggerConditionTest: Test<T> = (aspect: T) => true) => {
        return function (target: T, propertyName: string | symbol) {
            if (!(target instanceof Function)) {
                throw new TypeError(`target is not a Function instance in decorator Aspect.Trigger`);
            }
            if (!Object.hasOwn(target, PropertyTriggerTableSymbol)) {
                Object.defineProperty(target, PropertyTriggerTableSymbol, { configurable: true, value: (target[PropertyTriggerTableSymbol] ?? []).push() });
            }
            target[PropertyTriggerTableSymbol].push();

        };
    }

    Type<T extends object>(aspectCtor: new (...args: any[]) => T) {
        return function (...args: any[]) {
            const proxy = new Proxy(new aspectCtor(...args), {
                set(target: any, p: string | symbol, newValue: any, receiver: any): boolean {
                    const oldValue = target[p];
                    if (newValue === oldValue) {
                        return false;
                    } else {

                        return true;
                    }
                },
            });
            return proxy;
        };
    }
};

export class File {
    path: string;
    stats: nodeFs.Stats;
    @Aspect.Trigger('stats', _this => _this.stats.mtime > 
        File.prototype.calculateHash,
        // async (/* stats) */ file : File ) => await file.calculateHash(),
        { stats: /* async  */(file: File) => file.stats.mtime > (file._ts.hash?.updated ?? 0) }
    )
    hash?: string;
    previousHashes: string[] = [];

    constructor(...args: any[]) { //file: IFile) {
        const file = args[0] as IFile;
        super(file);

        this.path = file.path;
        this.stats = file.stats;
        this.hash = file.hash;
        this.previousHashes = file.previousHashes ?? [];
    }
}

export const FileSystemEntryPipeline =

    // Pipeline input is FS path strings inside POJO objects (e.g. { path: string })
    new Pipeline<{
        path: string,
        stats: Observable<nodeFs.Stats>,
    }>( pipe => { pipe

        // Perform a stat() on the FS path, then we can also use this to classify the items (i.e. { type: 'file' | 'dir' | 'unknown' })
        .map( async ({ path, stats }) => (<FileSystemEntryBase>{ path, stats: new BehaviorSubject(await nodeFs.promises.stat(path)) }) )
        .map( async ({ path, stats }) => (<FileSystemEntry>{
            path,
            stats,
            type: Promise.(stats).subscribe(stats => stats.isFile() ? 'file' : stats?.value.isDirectory() ? 'dir' : 'unknown' ). )
        

        .if( isDirectory, async directory => await pipe.run((await nodeFs.promises.readdir(directory.path)).map(subDir => ({ path: nodePath.join(directory.path, subDir) }))))
        .if( isFile, file => ({ ...file, hash: file.hash === undefined || file.stats.mtime > file.hash._ts.updated ?await calculateHash(file.path) }) )
        .if( isUnknown, unknown => unknown )
            .run({ path: './' });
    
    });

};