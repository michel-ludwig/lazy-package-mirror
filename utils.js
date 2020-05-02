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

const mkdirp           = require('mkdirp');
const fs               = require('fs');
const {promisify}      = require('util');
const fileOpenPromise  = promisify(fs.open);
const fileClosePromise = promisify(fs.close);

// compares version strings of the form x.y.z...-n
function compareVersionStrings(str1, str2)
{
    const allowedRegExp = /^[0-9]+(\.[0-9]+)*(\-[0-9]+)?$/;
    if(!str1.match(allowedRegExp)) {
        throw 'Illegal argument1.'
    }
    if(!str2.match(allowedRegExp)) {
        throw 'Illegal argument2.'
    }
    function compareStandardVersionString(str1, str2) {
        const components1 = str1.split('.');
        const components2 = str2.split('.');
        const maxLength = Math.max(components1.length, components2.length);
        for(let i = components1.length; i < maxLength; ++i) {
            components1.push('0');
        }
        for(let i = components2.length; i < maxLength; ++i) {
            components2.push('0');
        }

        for(let i = 0; i < maxLength; ++i) {
            const v1 = parseInt(components1[i], 10);
            const v2 = parseInt(components2[i], 10);
            if(v1 < v2) {
                return 1;
            }
            else if(v1 > v2) {
                return -1;
            }
        }
        return 0;
    }

    const dashIndex1 = str1.indexOf('-');
    const versionPart1 = (dashIndex1 < 0 ? str1 : str1.substring(0, dashIndex1));
    const extendedVersionString1 = (dashIndex1 < 0 ? '0' : str1.substring(dashIndex1 + 1));

    const dashIndex2 = str2.indexOf('-');
    const versionPart2 = (dashIndex2 < 0 ? str2 : str2.substring(0, dashIndex2));
    const extendedVersionString2 = (dashIndex2 < 0 ? '0' : str2.substring(dashIndex2 + 1));

    {
        const r = compareStandardVersionString(versionPart1, versionPart2);
        if(r !== 0) {
            return r;
        }
    }
    
    {
        const extendedVersion1 = parseInt(extendedVersionString1, 10);
        const extendedVersion2 = parseInt(extendedVersionString2, 10);

        if(extendedVersionString1 < extendedVersionString2) {
            return 1;
        }
        else if(extendedVersionString1 > extendedVersionString2) {
            return -1;
        }
        else {
            return 0;
        }
    }
}


function ensureEndsWithSlash(str) {
    if(str.endsWith('/')) {
        return str;
    }
    else {
        return str + '/';
    }
}


async function ensureParentDirectoriesExist(filePath)
{
    const lastSlashIndex = filePath.lastIndexOf('/');
    const pathWithoutFileName = filePath.substring(0, lastSlashIndex);
    await mkdirp(pathWithoutFileName);
}

async function ensureFileExists(filePath)
{
    const fd = await fileOpenPromise(filePath, 'a');
    await fileClosePromise(fd);
}

module.exports = {compareVersionStrings: compareVersionStrings,
                  ensureEndsWithSlash: ensureEndsWithSlash,
                  ensureParentDirectoriesExist: ensureParentDirectoriesExist,
                  ensureFileExists: ensureFileExists,
                 };

// kate: space-indent on; indent-width 4; mixedindent off;
