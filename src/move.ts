#!/usr/bin/env node

import recur from 'recursive-readdir';
import { filesize as filesizeFormat } from 'filesize';
import {  writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs'
import path from 'node:path';
import { CARDIFI_PREFIX, CopyFile, load } from './common.js';

export const move = async (sourceRoot: string, cardifiRoot: string, thresholdInMB: number) => {
    
    const copies: CopyFile[] = [];

    await recur(sourceRoot, [(file, stats) => {

        if (stats.size > +thresholdInMB * 1000 * 1000 && !file.endsWith(".exe")) {
            if (!lstatSync(file).isSymbolicLink()) {

                const originalDirSegments = file.split(path.sep);
                const filename = originalDirSegments.pop();

                const patch = [...originalDirSegments];
                const drive = patch.shift().replace(":", "_DRIVE");
                const targetDir = path.join(cardifiRoot, CARDIFI_PREFIX, drive, ...patch);
                const target = path.join(targetDir, filename);

                const displayPath = file.substring(sourceRoot.length).split("\\").filter(s => s).join("\\");
                console.log(`${copies.length + 1}. ${displayPath} (${filesizeFormat(stats.size)}) -> ${target}`);

                copies.push({
                    src: file,
                    target,
                    targetDir,
                    filename,
                    filesize: stats.size,
                    displayPath
                })
            }
        }
        return false;
    }]);


    await writeFile(
        path.join(sourceRoot,`cardifi-restore.${process.platform == 'win32' ? 'bat' : 'sh'}`), 
        `npx cardific -r`,
        {encoding:'utf8',flag:'w'}
    );
    await load(copies, 1);
}

