import * as mm /* { parseFile, IAudioMetadata } */ from 'music-metadata';
import { Aspect, Timestamped } from '.';

export const enum AudioType { Audio = "Audio" };
export type Audio = Aspect<AudioType.Audio, /* Timestamped< */mm.IAudioMetadata>/* > */;

export const Audio = async (path: string, options?: any): Promise<Audio> => {
    return ({ ...await mm.parseFile(path, {}), _T: AudioType.Audio/* , _ts: new Date(), */ });
};

Audio.fileExtensions = [ "mp3", "wav", "au", "aiff", "flac" ];
