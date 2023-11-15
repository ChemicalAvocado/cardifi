#!/usr/bin/env node

import recur from 'recursive-readdir';
import { filesize as filesizeFormat } from 'filesize';
import { readlink, stat } from 'node:fs/promises';
import { lstatSync } from 'node:fs'

import path from 'node:path';
import { CopyFile, CARDIFI_PREFIX, load } from './common.js';

export const restore = async (cwd: string) => {
    const symlinks: string[] = [];
    
    const cwdSegments = cwd.split(path.sep);

    await recur(cwd, [(file) => {
        if (lstatSync(file).isSymbolicLink()) {
            symlinks.push(file);
        }
        return false;
    }]);

    const copies: CopyFile[] = [];
    for(const symlink of symlinks){
        const linkedPath = await readlink(symlink);
        const originalDirSegments = linkedPath.split(path.sep);

        if(originalDirSegments.includes(CARDIFI_PREFIX)){
            const {size} = await stat(linkedPath);
            const filename = originalDirSegments.pop();

            const originalPathSegments = originalDirSegments.slice(originalDirSegments.indexOf(CARDIFI_PREFIX) + 1);
            const drive = originalPathSegments.shift().replace('_DRIVE', ':');

            const originalDirectorySegments = [drive, ...originalPathSegments];
            const originalDirectory = path.join(...originalDirectorySegments);
            const originalPath = path.join(originalDirectory, filename);

            const relativePathSegments = originalDirectorySegments.slice(cwdSegments.length);

            const displayPath = path.join(...relativePathSegments, filename);
            console.log(`${copies.length + 1}. ${linkedPath} (${filesizeFormat(size)}) -> ${originalPath}`)
            
            copies.push({
                src: linkedPath,
                target: originalPath,
                targetDir: originalDirectory,
                filename,
                filesize: size,
                displayPath
            })
        }
    }

    await load(copies, 1, false);
}