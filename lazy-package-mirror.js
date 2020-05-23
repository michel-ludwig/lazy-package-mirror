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
const path    = require('path');

const cache   = require('./cache');
const utils   = require('./utils');

function readRepoConfigFileForDistro(configFile)
{
    const configFileContent = fs.readFileSync(configFile, 'utf-8');
    parsedConfig = ini.parse(configFileContent);

    const toReturn = {};
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
        toReturn[repoName] = {downloadURL: downloadURL};
    }
    return toReturn;
}

function parseConfig()
{
    const configDir = '/etc/lazy-package-mirror/';
    const configFile = configDir + 'lazy-package-mirror.conf';
    const distroRepositoryConfigurationDir = configDir + 'distros.d/';

    const config = {};
    let parsedConfig = {};
    try {
        const configFileContent = fs.readFileSync(configFile, 'utf-8');
        parsedConfig = ini.parse(configFileContent);
    }
    catch(err) {
        console.error('WARNING: Could not read the configuration file', configFile, ':', err);
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
    try {
        const directory = fs.opendirSync(distroRepositoryConfigurationDir)
        let dirEntry = null;
        while(dirEntry = directory.readSync()) {
            const distroName = path.parse(dirEntry.name).name;
            const repos = readRepoConfigFileForDistro(distroRepositoryConfigurationDir + dirEntry.name);
            config.repos[distroName] = repos;
        }
        directory.closeSync()
    }
    catch(err) {
        console.error('WARNING: Could not read the repository configuration files:', err);
    }
    return config;
}

const app = express();

(async function() {

    try {
        const config = parseConfig();

        app.use('/admin', express.static('www-admin'))
        await cache.init(config);
        require('./routes')(app, cache, config);

        console.info('Using cache at', config.cacheDir);
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
