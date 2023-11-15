#!/usr/bin/env node

import {exec} from 'windows-elevate';
import {check} from 'tcp-port-used';
import {app} from './app.js';
import isAdmin from 'is-admin';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);


(async () => {

    if(process.platform != 'win32' || await isAdmin()){
        await app();
    }else{
        const isDebugging = await check(process.debugPort,'127.0.0.1');

        const args = [ __filename, ...(process.argv.splice(2))];
    
        if(isDebugging){
            args.unshift('--inspect=7001');
        }
        
        exec('node', args, (error, stdout, stderror) => {
            if (error) {
                console.error(`Failed: \n${stderror}`);
                return;
            }
            console.log(`Success: \n${stdout}`);
        });
    }

})();
