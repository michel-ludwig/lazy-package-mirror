//  cache.js
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

const fs = require('fs');
const {promisify} = require('util');
const fileReadFilePromise = promisify(fs.readFile);
const fileWriteFilePromise = promisify(fs.writeFile);
const fetch = require('node-fetch');

const { CachedFileReadStream } = require('./cached-file-stream');
const utils = require('./utils');

let m_config = null;
const m_cacheMapForRepo = new Map();

function getFileForCache(repo)
{
    return m_config.cacheDir + 'cache-info/' + repo + '.cache';
}

// contents of cache file on disk
// {relativePath: {completelyDownloaded: true/false}
// }

const m_cacheFileFormatVersionString = 'cache file format v1\n';
async function readCacheFromDisk(repo)
{
    const cacheMapForRepo = getCacheMapForRepo(repo);

    const cacheFile = getFileForCache(repo);
    let rawData = null;
    try {
        rawData = await fileReadFilePromise(cacheFile, {encoding: 'utf8'});
    }
    catch(err) {
        if(err.code === 'ENOENT') {
            console.info('Setting up new cache for repo', repo);
            rawData = m_cacheFileFormatVersionString + '{}';
        }
        else {
            throw err;
        }
    }
    if(!rawData.startsWith(m_cacheFileFormatVersionString)) {
        throw 'Unknown cache file format: ' + cacheFile;
    }
    rawData = rawData.substring(m_cacheFileFormatVersionString.length); // remove the version string
    const storedCacheObject = JSON.parse(rawData);
    for(let relativePath in storedCacheObject) {
        if(!storedCacheObject.hasOwnProperty(relativePath)) {
            continue;
        }
        const cacheInfo = createEmptyCacheMapEntry();
        cacheInfo.releasever = storedCacheObject[relativePath].releasever;
        cacheInfo.basearch = storedCacheObject[relativePath].basearch;
        cacheInfo.completelyDownloaded = storedCacheObject[relativePath].completelyDownloaded;
        cacheInfo.downloadedLength = storedCacheObject[relativePath].downloadedLength;
        cacheInfo.dataFile = getDiskPathRaw(repo, relativePath);
        cacheMapForRepo.set(relativePath, cacheInfo);
    }
}


let m_cacheWritingInProgress = false;
let m_cacheWritingImmediate = false;

async function writeCachesToDisk()
{
    async function writeCacheToDisk(repo)
    {
        const cacheFile = getFileForCache(repo);
        await utils.ensureParentDirectoriesExist(cacheFile);

        const cacheMap = getCacheMapForRepo(repo);

        const toSave = {};
        for(const [relativePath, cacheInfo] of cacheMap) {
            const objectForFilePath = {};
            objectForFilePath.completelyDownloaded = cacheInfo.completelyDownloaded;
            objectForFilePath.downloadedLength = cacheInfo.downloadedLength;
            objectForFilePath.releasever = cacheInfo.releasever;
            objectForFilePath.basearch = cacheInfo.basearch;
            toSave[relativePath] = objectForFilePath;
        }

        //TOOD: better to turn this into a stream:
        const rawData = m_cacheFileFormatVersionString + JSON.stringify(toSave);
        try {
            await fileWriteFilePromise(cacheFile, rawData, {encoding: 'utf8', flag: 'w'});
        }
        catch(error) {
            console.error('a', error);
        }
    }

    if(m_cacheWritingInProgress) {
        // if there is no call to 'writeCachesToDisk' scheduled yet, schedule one
        if(!m_cacheWritingImmediate) {
            m_cacheWritingImmediate = setImmediate(writeCachesToDisk);
        }
        return;
    }
    m_cacheWritingInProgress = true;
    // clear any scheduled call
    if(m_cacheWritingImmediate) {
        clearImmediate(m_cacheWritingImmediate);
        m_cacheWritingImmediate = null;
    }
    for(let repoName in m_config.repos) {
        if(!m_config.repos.hasOwnProperty(repoName)) {
            continue;
        }
        try {
            await writeCacheToDisk(repoName);
        }
        catch(err) {
            console.error('Cache for repo', repoName, 'could not be saved:', err);
        }
    }
    m_cacheWritingInProgress = false;
}

// {
//     downloadedLength:
//     dataFile:
//     completelyDownloaded: true/false
//     readersArray: Array
// }

function getCacheMapForRepo(repo)
{
    if(!m_cacheMapForRepo.has(repo)) {
        m_cacheMapForRepo.set(repo, new Map());
    }
    return m_cacheMapForRepo.get(repo);
}

function getRelativePath(releasever, basearch, path)
{
    return releasever + '/' + basearch + '/' + path;
}

function createEmptyCacheMapEntry()
{
    return {completelyDownloaded: false,
            readersArray: [],
//             downloadedLength: 0
           };
}

function getCacheInfo(repo, releasever, basearch, path)
{
    const cacheMapForRepo = getCacheMapForRepo(repo);

    const relativePath = getRelativePath(releasever, basearch, path);

    if(!cacheMapForRepo.has(relativePath)) {
        cacheMapForRepo.set(relativePath, createEmptyCacheMapEntry());
    }
    return cacheMapForRepo.get(relativePath);
}

// function setCacheInfo(repo, path, info)
// {
//     const key = {repo: repo, path: path};
//     cacheMap.set(key, info);
// }

let m_cacheDataDir = null;

function getDiskPath(repo, releasever, basearch, path)
{
    return m_cacheDataDir + repo + '/' + releasever + '/' + basearch + '/' + path;
}

function getDiskPathRaw(repo, diskPath)
{
    return m_cacheDataDir + repo + '/' + diskPath;
}

/* Currently, we have a very simple caching strategy:
 * files ending in *.rpm or *.drpm are cached, all others are not
 */
async function fileRequested(repo, releasever, basearch, path, incomingRes)
{
    if(m_config.logRequests) {
        console.log('file requested:', repo, releasever, basearch, path);
    }
    if(!path.endsWith(".rpm") && !path.endsWith(".drpm")) { // we only cache rpm files
        if(m_config.logRequests) {
            console.log('\tnot using cache');
        }
        await downloadAndTransfer(repo, releasever, basearch, path, incomingRes);
        return;
    }

    const cacheInfo = getCacheInfo(repo, releasever, basearch, path);
// console.log('found cacheInfo', cacheInfo);
    if(cacheInfo.completelyDownloaded) {
        if(m_config.logRequests) {
            console.log('\talready completely downloaded; transferring from cache');
        }
        await continuouslyTransferFile(repo, releasever, basearch, path, incomingRes);
    }
    else if(cacheInfo.downloading) {
        if(m_config.logRequests) {
            console.log('\tdownload in progress; transferring from cache');
        }
        await continuouslyTransferFile(repo, releasever, basearch, path, incomingRes);
    }
    else {
        if(m_config.logRequests) {
            console.log('\tdownloading...');
        }
        await downloadAndDistribute(repo, releasever, basearch, path, incomingRes);
    }
}

function containsCacheFileReadStream(stream, cacheInfo)
{
    return cacheInfo.readersArray.indexOf(stream) >= 0;
}

function addCacheFileReadStream(stream, cacheInfo)
{
    if(containsCacheFileReadStream(stream, cacheInfo)) {
        return;
    }
    cacheInfo.readersArray.push(stream);
}

function removeCacheFileReadStream(stream, cacheInfo)
{
    const index = cacheInfo.readersArray.indexOf(stream);
    if(index < 0) {
        return;
    }
    cacheInfo.readersArray.splice(index, 1);
}

function notifyCacheFileReadersOfData(cacheInfo)
{
    for(let i = 0; i < cacheInfo.readersArray.length; ++i) {
        const reader = cacheInfo.readersArray[i];
        reader.readInReactionToBytesWritten();
    }
}

async function continuouslyTransferFile(repo, releasever, basearch, path, incomingRes)
{
    const cacheInfo = getCacheInfo(repo, releasever, basearch, path);

    const cachedFileReadStream = new CachedFileReadStream(cacheInfo, incomingRes);
    addCacheFileReadStream(cachedFileReadStream, cacheInfo);

    cachedFileReadStream.on('end', function() {
                                        incomingRes.end();
                                        removeCacheFileReadStream(cachedFileReadStream, cacheInfo);
                                   });

    const headers = {'content-type': 'application/octet-stream'};
    if(cacheInfo.predictedContentLength) {
        headers['content-length'] = cacheInfo.predictedContentLength;
    }
    incomingRes.writeHead(200, headers);

    cachedFileReadStream.pipe(incomingRes);
}

function constructDownloadURL(repo, releasever, basearch, path)
{
    if(!m_config.hasOwnProperty('repos')
        || !m_config.repos.hasOwnProperty(repo)
        || !m_config.repos[repo].hasOwnProperty('downloadURL')) {
        throw 'Repo ' + repo + ' not configured correctly!';
    }

    const rawRepoURL = m_config.repos[repo].downloadURL;

    let repoURL = rawRepoURL.replace(/\$releasever/g, releasever);
    repoURL = repoURL.replace(/\$basearch/g, basearch);
    repoURL = utils.ensureEndsWithSlash(repoURL) + path;
    return repoURL;
}

async function downloadAndTransfer(repo, releasever, basearch, path, incomingRes) {

    const url = constructDownloadURL(repo, releasever, basearch, path);

    try {
        const res = await fetch(url);

        if(res.status < 200 || res.status >= 300) {
            incomingRes.sendStatus(res.status);
            return;
        }

        const contentLength = res.headers.get('content-length');
        const headers = {'content-type': res.headers.get('content-type')};
        if(contentLength !== undefined) {
            headers['content-length'] = contentLength;
        }
        incomingRes.writeHead(200, headers);
        res.body.pipe(incomingRes);
    }
    catch(error) {
        console.error('WARNING: an error occurred while downloading:', repo, releasever, basearch, path);
    }
}

async function downloadAndDistribute(repo, releasever, basearch, path, incomingRes)
{
    const cacheInfo = getCacheInfo(repo, releasever, basearch, path);

// introduce cacheInfo.downloadIsBeingSetup state...
    cacheInfo.downloadedLength = 0;
    const diskPath = getDiskPath(repo, releasever, basearch, path);
    cacheInfo.dataFile = diskPath;
    cacheInfo.releasever = releasever;
    cacheInfo.basearch = basearch;

    try {
        await utils.ensureParentDirectoriesExist(diskPath);
        await utils.ensureFileExists(diskPath);
    }
    catch(error) {
        console.log('error occured while setting up:', error);
        // TODO: send error
        return;
    }

    function handleDataReceived(chunk) {
        cacheInfo.downloadedLength += chunk.length;
        notifyCacheFileReadersOfData(cacheInfo);
    }

    function handleEnd() {
        if(m_config.logRequests) {
            console.log('download complete for', repo, releasever, basearch, path);
        }
        cacheInfo.downloading = false;
        cacheInfo.completelyDownloaded = true;
        setImmediate(writeCachesToDisk);
    }

    function handleError(error) {
        console.error('An error occurred:', error);
        cacheInfo.downloading = false;
    }

    cacheInfo.completelyDownloaded = false;

    const url = constructDownloadURL(repo, releasever, basearch, path);

    try {
        const res = await fetch(url);
        //TODO: improve error status handling
        //TODO: add handling of more status codes
        if (res.status < 200 || res.status >= 300) {
            console.error('got status code', res.status);
            incomingRes.sendStatus(res.status);
            return;
        }

        cacheInfo.predictedContentLength = res.headers.get('content-length');
        cacheInfo.downloading = true;

        const fileWriteStream = fs.createWriteStream(diskPath);

        fileWriteStream.on('finish', handleEnd);

        res.body.on('data', handleDataReceived);

        res.body.on('error', handleError);

        res.body.on('abort', handleError);

        res.body.pipe(fileWriteStream);

        continuouslyTransferFile(repo, releasever, basearch, path, incomingRes);
    }
    catch(error) {
        console.error('WARNING: an error occured while downloading:', error);
    }
}

async function init(config)
{
    m_config = config;
    if(!m_config.hasOwnProperty('cacheDir')) {
        console.error('No cache directory configured!');
    }
    m_config.cacheDir = utils.ensureEndsWithSlash(m_config.cacheDir);
    m_cacheDataDir = m_config.cacheDir + 'cache-data/';

    for(let repoName in m_config.repos) {
        if(!m_config.repos.hasOwnProperty(repoName)) {
            continue;
        }
        console.log('Initializing repo \'' + repoName + '\'');
        await readCacheFromDisk(repoName);
    }
}

module.exports = {fileRequested: fileRequested,
                  init: init,
                  writeCachesToDisk: writeCachesToDisk,
                 };

// kate: space-indent on; indent-width 4; mixedindent off;
