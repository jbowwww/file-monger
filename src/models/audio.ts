import { parseFile, IAudioMetadata } from 'music-metadata';
import { Aspect, Timestamped } from '.';

export const enum AudioType { Audio = "Audio" };
export type Audio = Aspect<AudioType.Audio, Timestamped<{ Audio: IAudioMetadata; }>>;

export const Audio = async (path: string, options?: any): Promise<Audio> => {
    return ({ _T: AudioType.Audio, _ts: new Date(), Audio: await parseFile(path, {}), });
};

Audio.fileExtensions = [ "mp3", "wav", "au", "aiff", "flac" ];
