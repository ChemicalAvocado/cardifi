#!/usr/bin/env node
import inquirer from 'inquirer';
import { restore } from './restore.js';
import { move } from './move.js';

 export const app = (async () => {

    if(process.argv.includes('-r')){

        console.log('====== Cardifi Restore ======');
        const answers = await inquirer.prompt([{
            type: 'input',
            name: 'sourceRoot',
            message: 'Entry point:',
            default: () => process.cwd()
        }]);
        const {sourceRoot} = answers;
        await restore(sourceRoot);

    }else{

        console.log('====== Cardifi Migration ======');
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

        const {sourceRoot, cardifiRoot, thresholdInMB} = answers;
        await move(sourceRoot, cardifiRoot, thresholdInMB);

    }
});
