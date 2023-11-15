#!/usr/bin/env node

import bar from 'cli-progress';
import { filesize as filesizeFormat } from 'filesize';
import { symlink, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs'
import copyFile from 'cp-file';

export const CARDIFI_PREFIX = '__CARDIFI__';

export interface CopyFile {
    src: string,
    filename: string,
    target: string,
    targetDir: string,
    displayPath: string,
    filesize: number
}

export const load = async (copies: CopyFile[], workers = 4, createLink = true) => {

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
                if(existsSync(target)){
                    await unlink(target);
                }
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
