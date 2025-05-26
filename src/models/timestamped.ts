import { isDate } from "util/types";
import { AbstractConstructor, Aspect } from ".";
import { ChangeTrackingProxy } from "../change-tracking-proxy";


export class Timestamps {
    isTimestamps: true = true;
    static is = (value: any): value is Timestamps => value && value.isTimestamps;
    created!: Date;
    checked?: Date;
    updated?: Date;
    deleted?: Date;
    constructor(data?: Timestamps | Date) {
        this.init(data);
    }
    init(data?: Timestamps | Date) {
        if (Timestamps.is(data)) {
            this.created = data.created;
            this.checked = data.checked;
            this.updated = data.updated;
            this.deleted = data.deleted;
        } else {
            this.created = isDate(data) ? data : new Date();
        }
    }
    markChecked(checked?: Date) {
        this.checked = checked ?? new Date();
    }
    markUpdated(updated?: Date) {
        this.updated = updated ?? new Date();
    }
    markDeleted(deleted?: Date) {
        this.deleted = deleted ?? new Date();
    }
}

export function WithTimestamp(newTypeName: string, aspectType: AbstractConstructor): AbstractConstructor;
export function WithTimestamp(aspectType: AbstractConstructor): AbstractConstructor;
export function WithTimestamp(aspectTypeOrNewName: AbstractConstructor | string, aspectTypeOptional?: AbstractConstructor): AbstractConstructor {
    let aspectType: AbstractConstructor<Aspect> = aspectTypeOptional ?? aspectTypeOrNewName as AbstractConstructor;
    let newTypeName = typeof aspectTypeOrNewName === "string" ? aspectTypeOrNewName : "Timestamped" + aspectType.name;
    const newType = class extends aspectType {
        _ts: Timestamps = new Timestamps();
        markChecked = this._ts.markChecked.bind(this._ts);
        markUpdated = this._ts.markUpdated.bind(this._ts);
        markDeleted = this._ts.markDeleted.bind(this._ts);
        constructor(...args: ConstructorParameters<typeof aspectType>) {
            super(...args);
            const notify = (path: string, oldValue: any, newValue: any, isModified: boolean) => {
                
            };
            return ChangeTrackingProxy(this, notify);
        }
    };
    Object.defineProperty(newType, "name", { value: newTypeName });
    return newType;
}
