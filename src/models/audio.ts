import * as nodePath from "node:path";
import * as mm from "music-metadata";
import { Aspect } from ".";

import debug from "debug";
import { INativeTags, IQualityInformation } from "music-metadata/lib/type";
const log = debug(nodePath.basename(module.filename));


declare module "./artefact" {
    export interface ArtefactSchemaMaster {
        Audio: Audio;
    }
}

export const fileExtensions = [ "mp3", "wav", "au", "aiff", "flac" ];

export class Audio extends Aspect {
    // static _T = "Audio"; // should already be taken care of with Aspect base class
    constructor(
        public format: mm.IFormat,
        public native: INativeTags,
        public quality: IQualityInformation,
        public common: mm.ICommonTagsResult,
    ) {
        super();
    }
    static async create(path: string): Promise<Audio> {
        const audio = await mm.parseFile(path, {});
        return new Audio(audio.format, audio.native, audio.quality, audio.common);
    }
}

// export type Audio = Aspect<"Audio", mm.IAudioMetadata>;

// export const Audio = async (path: string, options?: any): Promise<Audio> => {
//     return ({ ...await mm.parseFile(path, {}), _T: "Audio" });
// };
