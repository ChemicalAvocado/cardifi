#!/usr/bin/env node

import dotenv from 'dotenv';
import recur from 'recursive-readdir';
import bar from 'cli-progress';
import { filesize } from 'filesize';
import { symlink, mkdir, unlink, lstat } from 'node:fs/promises';
import { lstatSync } from 'node:fs'
import copyFile from 'cp-file';
import inquirer from 'inquirer';

import path from 'node:path';

dotenv.config();

interface CopyFile {
    src: string,
    filename: string,
    target: string,
    targetDir: string,
    displayPath: string,
    size: number
}

//const { SOURCE = '', TARGET = '', thresholdInMB = 10 } = process.env;



const load = async (copies: CopyFile[], workers = 4) => {

    const fullLength = copies.length;
    const overallSize = copies.reduce((sum, cur) => sum + cur.size, 0);
    let settledSize = 0;

    const done = [];
    const failed = [];
    const inprogress: number[] = [];

    const multibar = new bar.MultiBar({ clearOnComplete: false, hideCursor: true }, bar.Presets.shades_classic);
    const overall = multibar.create(100, 0, {
        done: done.length,
        fullLength,
        written: 0,
        overallSize: filesize(overallSize),
        bandwidth: 0
    }, { format: `[{bar}] {done}/{fullLength} | {bandwidth}ps | {written} of {overallSize} | {percentage}%` });

    const worker = async (workId: number, bar: bar.SingleBar): Promise<void> => {
        const entry = copies.shift();

        if (entry) {
            const { src, size, target, displayPath, targetDir } = entry;



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
                            bandwidth: filesize(bandwidth)
                        });

                        lastWritten = p.writtenBytes;
                        lastUpdate = performance.now();
                    }

                    bar.update(p.percent * 100, { src: displayPath, written: filesize(p.writtenBytes), size: filesize(size) });
                    inprogress[workId] = p.percent * 100;

                    overall.update(overallPercentage, {
                        done: done.length + 1,
                        written: filesize(settledSize + p.writtenBytes)
                    });

                });
                settledSize += size;
                await unlink(src);
                await symlink(target, src);

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


(async () => {

    const answers = await inquirer.prompt([{
        type: 'input',
        name: 'SOURCE',
        message: 'Entry point:',
        default: () => process.cwd()
    },{
        type: 'input',
        name: 'TARGET',
        message: 'Cardify Directory:',
        default: () => (process.platform == 'win32' ? 'E:\\' : '/run/media/mmcblk0p1/') + '__Cardify'
    },{
        type: 'number',
        name: 'thresholdInMB',
        message: 'File size threshold in MB?',
        default: () => 100
    }]);

    const {SOURCE, TARGET, thresholdInMB} = answers;

    console.log({answers});

    const copies: CopyFile[] = [];

    await recur(SOURCE, [(file, stats) => {

        if (stats.size > +thresholdInMB * 1000 * 1000 && !file.endsWith(".exe")) {
            if (!lstatSync(file).isSymbolicLink()) {

                const originalDirSegments = file.split(/[\\\/]/g);
                const filename = originalDirSegments.pop();

                const patch = [...originalDirSegments];
                const drive = patch.shift().replace(":", "_DRIVE");
                const targetDir = path.join(TARGET, drive, ...patch);
                const target = path.join(targetDir, filename);

                const displayPath = file.substring(SOURCE.length).split("\\").filter(s => s).join("\\");
                console.log(`${copies.length + 1}. ${displayPath} (${filesize(stats.size)}) -> ${target}`)

                copies.push({
                    src: file,
                    target,
                    targetDir,
                    filename,
                    size: stats.size,
                    displayPath
                })
            }
        }
        return false;
    }]);

    await load(copies, 1);
})();

