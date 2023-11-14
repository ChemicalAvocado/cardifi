#!/usr/bin/env node

import recur from 'recursive-readdir';
import bar from 'cli-progress';
import { filesize as filesizeFormat } from 'filesize';
import { symlink, mkdir, unlink, lstat, readlink, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs'
import copyFile from 'cp-file';
import inquirer from 'inquirer';
//import PressToContinuePrompt from 'inquirer-press-to-continue';
//import type { KeyDescriptor } from 'inquirer-press-to-continue';

import path from 'node:path';
import { stat } from 'fs-extra';

//inquirer.registerPrompt('press-to-continue', PressToContinuePrompt);

interface CopyFile {
    src: string,
    filename: string,
    target: string,
    targetDir: string,
    displayPath: string,
    filesize: number
}

//const { SOURCE = '', TARGET = '', thresholdInMB = 10 } = process.env;

const CARDIFI_PREFIX = '__Cardify'

const load = async (copies: CopyFile[], workers = 4, createLink = true) => {

    const fullLength = copies.length;
    const overallSize = copies.reduce((sum, cur) => sum + cur.filesize, 0);
    let settledSize = 0;

    const done = [];
    const failed = [];
    const inprogress: number[] = [];

    const multibar = new bar.MultiBar({ clearOnComplete: false, hideCursor: true }, bar.Presets.shades_classic);
    const overall = multibar.create(100, 0, {
        done: done.length,
        fullLength,
        written: 0,
        overallSize: filesizeFormat(overallSize),
        bandwidth: 0
    }, { format: `[{bar}] {done}/{fullLength} | {bandwidth}ps | {written} of {overallSize} | {percentage}%` });

    const worker = async (workId: number, bar: bar.SingleBar): Promise<void> => {
        const entry = copies.shift();

        if (entry) {
            const { src, filesize, target, displayPath, targetDir } = entry;
            
            try {
                let lastUpdate = performance.now();
                let lastWritten = 0;
                await mkdir(targetDir, { recursive: true });
                await copyFile(src, target).on('progress', (p) => {

                    const overallPercentage = (settledSize + p.writtenBytes) / overallSize * 100;

                    const timeSpan = performance.now() - lastUpdate;
                    if (timeSpan > 1000) {
                        const bandwidth = (p.writtenBytes - lastWritten) / (timeSpan / 1000);

                        overall.update(overallPercentage, {
                            bandwidth: filesizeFormat(bandwidth)
                        });

                        lastWritten = p.writtenBytes;
                        lastUpdate = performance.now();
                    }

                    bar.update(p.percent * 100, { src: displayPath, written: filesizeFormat(p.writtenBytes), size: filesizeFormat(filesize) });
                    inprogress[workId] = p.percent * 100;

                    overall.update(overallPercentage, {
                        done: done.length + 1,
                        written: filesizeFormat(settledSize + p.writtenBytes)
                    });

                });
                settledSize += filesize;
                await unlink(src);
                if(createLink){
                    await symlink(target, src);
                }

            } catch (err) {
                failed.push(src);
                console.error(err);
            }

            done.push(entry);
            delete inprogress[workId];
            return worker(workId, bar);
        }
    }
    const p: Promise<void>[] = [];

    for (let i = 0; i < workers; i++) {
        const bar = multibar.create(100, 0, { src: '', written: 0, size: 0 }, { format: `[{bar}] {src} | {written} of {size} | {percentage}%` });
        p.push(worker(i, bar));
    }
    await Promise.all(p);

    multibar.stop();
    console.error(failed.join('\n'));
};

const restore = async () => {
    const symlinks: string[] = [];
    
    //process.cwd();
    await recur('D:\\EAPlay\\Crysis 3', [(file) => {
        if (lstatSync(file).isSymbolicLink()) {
            symlinks.push(file);
        }
        return false;
    }]);

    const copies: CopyFile[] = [];
    for(const symlink of symlinks){
        const linkedPath = await readlink(symlink);
        const originalDirSegments = linkedPath.split(path.delimiter);

        if(originalDirSegments.includes(CARDIFI_PREFIX)){
            const {size} = await stat(linkedPath);
            const filename = originalDirSegments.pop();

            const originalPathSegments = originalDirSegments.slice(originalDirSegments.indexOf(CARDIFI_PREFIX));
            const drive = originalPathSegments.shift().replace('_DRIVE', ':');
            const originalDirectory = path.join(drive, ...originalPathSegments);
            const originalPath = path.join(originalDirectory, filename);

            console.log(`${copies.length + 1}. ${filename} (${filesizeFormat(size)}) -> ${originalPath}`)
            
            copies.push({
                src: linkedPath,
                target: originalPath,
                targetDir: originalDirectory,
                filename,
                filesize: size,
                displayPath: originalPath
            })
        }
    }


    load(copies, 1, false);
}
const move = async (sourceRoot: string, cardifiRoot: string, thresholdInMB: number) => {
    
    const copies: CopyFile[] = [];

    await recur(sourceRoot, [(file, stats) => {

        if (stats.size > +thresholdInMB * 1000 * 1000 && !file.endsWith(".exe")) {
            if (!lstatSync(file).isSymbolicLink()) {

                const originalDirSegments = file.split(path.delimiter);
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


(async () => {

    const [arg] =process.argv

    if(arg == '-r'){
        await restore();
    }else{

        const answers = await inquirer.prompt([{
            type: 'input',
            name: 'sourceRoot',
            message: 'Entry point:',
            default: () => process.cwd()
        },{
            type: 'input',
            name: 'cardifiRoot',
            message: 'Cardifi Directory Location:',
            default: () => (process.platform == 'win32' ? 'E:\\' : '/run/media/mmcblk0p1/')
        },{
            type: 'number',
            name: 'thresholdInMB',
            message: 'File size threshold in MB?',
            default: () => 100
        }]);
        console.log({answers});

        const {sourceRoot, cardifiRoot, thresholdInMB} = answers;

        move(sourceRoot, cardifiRoot, thresholdInMB);

    }



})();

