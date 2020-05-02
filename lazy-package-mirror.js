// lazy-package-mirror.js
//
//  Copyright (C) 2020 Michel Ludwig
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with this program.  If not, see <https://www.gnu.org/licenses/>.

const fs      = require('fs');
const ini     = require('ini')
const express = require('express');

const cache   = require('./cache');
const utils   = require('./utils');

function parseConfig()
{
    const configFile = '/etc/lazy-package-mirror/lazy-package-mirror.conf';
    const config = {};
    let parsedConfig = {};
    try {
        const configFileContent = fs.readFileSync(configFile, 'utf-8');
        parsedConfig = ini.parse(configFileContent);
    }
    catch(err) {
        console.error('WARNING: Could not read the configuration file:', configFile);
    }

    const defaultPort = 7000;
    config.listenPort = parseInt(parsedConfig.listenPort, 10) || defaultPort;
    if(config.listenPort < 0 || config.listenPort > 65535) {
        config.listenPort = defaultPort;
    }

    config.listenAddress = parsedConfig.listenAddress || null;

    config.cacheDir = parsedConfig.cacheDir || '/var/cache/lazy-package-mirror/';
    config.hostName = parsedConfig.hostName || 'localhost';
    config.logRequests = parsedConfig.logRequests || false;

    config.repos = {};
    for(let configKey in parsedConfig) {
        if(!configKey.startsWith('repo:')) {
            continue;
        }
        const repoName = configKey.substring(5); // remove 'repo:'
        const downloadURL = parsedConfig[configKey].downloadURL;
        if(!downloadURL) {
            console.error('WARNING: repository', repoName, 'doesn\'t have a download URL');
            continue;
        }
        config.repos[repoName] = {downloadURL: downloadURL};
    }
    return config;
}

const app = express();

(async function() {

    const config = parseConfig();

    try {
//         app.use('/admin', express.static('www-admin'))
        await cache.init(config);
        require('./routes')(app, cache, config);

        app.listen(config.listenPort, config.listenAddress, null, () => {
            console.info('lazy-package-mirror is listening on port', config.listenPort);
        });
    }
    catch(err) {
        console.error(err);
        console.error('Exiting...');
    }

}) ();


// kate: space-indent on; indent-width 4; mixedindent off;
