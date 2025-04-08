import * as nodePath from "node:path";
import * as mm from "music-metadata";
import { Aspect } from ".";

import debug from "debug";
const log = debug(nodePath.basename(module.filename));

export type Audio = Aspect<"Audio", mm.IAudioMetadata>;

export const Audio = async (path: string, options?: any): Promise<Audio> => {
    return ({ ...await mm.parseFile(path, {}), _T: "Audio" });
};

export const fileExtensions = [ "mp3", "wav", "au", "aiff", "flac" ];
