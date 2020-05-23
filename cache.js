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
const fileUnlinkPromise = promisify(fs.unlink);
const fetch = require('node-fetch');

const { CachedFileReadStream } = require('./cached-file-stream');
const utils = require('./utils');

let m_config = null;
// m_cacheMapForDistro -> (repo -> cacheInfo) -> cacheInfo
const m_cacheMapForDistro = new Map();

function getFileForCache(distro, repo)
{
    return m_config.cacheDir + 'cache-info/' + distro + '/' + repo + '.cache';
}

// contents of cache file on disk
// {relativePath: {completelyDownloaded: true/false}
// }

const m_cacheFileFormatVersionString = 'cache file format v1\n';
async function readCacheFromDisk(distro, repo)
{
    const cacheMapForDistroRepo = getCacheMapForDistroRepo(distro, repo);

    const cacheFile = getFileForCache(distro, repo);
    let rawData = null;
    try {
        rawData = await fileReadFilePromise(cacheFile, {encoding: 'utf8'});
    }
    catch(err) {
        if(err.code === 'ENOENT') {
            console.info('Setting up new cache for distro', '\'' + distro + '\'', 'and repo', '\'' + repo + '\'');
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
        if(storedCacheObject[relativePath].hasOwnProperty('downloadFinishedAt')) {
            cacheInfo.downloadFinishedAt = new Date(storedCacheObject[relativePath].downloadFinishedAt);
        }
        cacheInfo.downloadedLength = storedCacheObject[relativePath].downloadedLength;
        cacheInfo.dataFile = getDiskPathRaw(distro, repo, relativePath);
        cacheMapForDistroRepo.set(relativePath, cacheInfo);
    }
}


let m_cacheWritingInProgress = false;
let m_cacheWritingImmediate = false;

async function writeCachesToDisk()
{
    async function writeCacheToDisk(distro, repo)
    {
        const cacheFile = getFileForCache(distro, repo);
        await utils.ensureParentDirectoriesExist(cacheFile);

        const cacheMap = getCacheMapForDistroRepo(distro, repo);

        const toSave = {};
        for(const [relativePath, cacheInfo] of cacheMap) {
            const objectForFilePath = {};
            objectForFilePath.completelyDownloaded = cacheInfo.completelyDownloaded;
            objectForFilePath.downloadedLength = cacheInfo.downloadedLength;
            if(cacheInfo.hasOwnProperty('downloadFinishedAt')) {
                objectForFilePath.downloadFinishedAt = (cacheInfo.downloadFinishedAt).getTime();
            }
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

    for(let distroName in m_config.repos) {
        if(!m_config.repos.hasOwnProperty(distroName)) {
            continue;
        }
        for(let repoName in m_config.repos[distroName]) {
            if(!m_config.repos[distroName].hasOwnProperty(repoName)) {
                continue;
            }
            try {
                await writeCacheToDisk(distroName, repoName);
            }
            catch(err) {
                console.error('Cache for repo', repoName, 'could not be saved:', err);
            }
        }
    }
    m_cacheWritingInProgress = false;
}

// {
//     downloadedLength:
//     dataFile:
//     completelyDownloaded: true/false
//     readersArray: Array
//     deletionScheduled: true/false
//     releasever:
//     basearch:
// }

function getCacheMapForDistroRepo(distro, repo)
{
    let cacheMapForRepo = null;
    if(!m_cacheMapForDistro.has(distro)) {
        cacheMapForRepo = new Map();
        m_cacheMapForDistro.set(distro, cacheMapForRepo);
    }
    else {
        cacheMapForRepo = m_cacheMapForDistro.get(distro)
    }

    if(!cacheMapForRepo.has(repo)) {
        cacheMapForRepo.set(repo, new Map());
    }
    return cacheMapForRepo.get(repo);
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

function getCacheInfo(distro, repo, releasever, basearch, path)
{
    const cacheMapForDistroRepo = getCacheMapForDistroRepo(distro, repo);

    const relativePath = getRelativePath(releasever, basearch, path);

    if(!cacheMapForDistroRepo.has(relativePath)) {
        cacheMapForDistroRepo.set(relativePath, createEmptyCacheMapEntry());
    }
    return cacheMapForDistroRepo.get(relativePath);
}

function removeCacheInfo(distro, repo, cacheInfo)
{
    const cacheMapForDistroRepo = getCacheMapForDistroRepo(distro, repo);

    const relativePath = getRelativePathFromDiskPath(distro, repo, cacheInfo.dataFile);

    cacheMapForDistroRepo.delete(relativePath);
}

function containsCachedFile(distro, repo, releasever, basearch, path)
{
    if(!m_cacheMapForDistro.has(distro)) {
        return false;
    }
    let cacheMapForDistro = m_cacheMapForDistro.get(distro);

    if(!cacheMapForDistro.has(repo)) {
        return false;
    }
    const cacheMapForRepo = cacheMapForDistro.get(repo);

    const relativePath = getRelativePath(releasever, basearch, path);

    return cacheMapForRepo.has(relativePath);
}

// function setCacheInfo(repo, path, info)
// {
//     const key = {repo: repo, path: path};
//     cacheMap.set(key, info);
// }

let m_cacheDataDir = null;

function getDiskPath(distro, repo, releasever, basearch, path)
{
    return m_cacheDataDir + distro + '/' + repo + '/' + releasever + '/' + basearch + '/' + path;
}

function getDiskPathRaw(distro, repo, relativePath)
{
    return m_cacheDataDir + distro + '/' + repo + '/' + relativePath;
}

function getRelativePathFromDiskPath(distro, repo, diskPath)
{
    const prefix = m_cacheDataDir + distro + '/' + repo + '/';
    if(!diskPath.startsWith(prefix)) {
        throw('getRelativePath: wrong distro or repo given: ' + distro + ', ' + repo + ', ' + diskPath);
    }
    return diskPath.substring(prefix.length);
}

// relative path as it was on the remote mirror
function getRealRelativePathFromDiskPath(distro, repo, releasever, basearch, diskPath)
{
    const prefix = m_cacheDataDir + distro + '/' + repo + '/' + releasever + '/' + basearch + '/';
    if(!diskPath.startsWith(prefix)) {
        throw('getRelativePath: wrong distro or repo given: ' + distro + ', ' + repo + ', ' + diskPath);
    }
    return diskPath.substring(prefix.length);
}

// relative path as it was on the remote mirror
function getRealRelativePathFromCacheInfo(distro, repo, cacheInfo)
{
    return getRealRelativePathFromDiskPath(distro, repo, cacheInfo.releasever, cacheInfo.basearch, cacheInfo.dataFile);
}

// contains objects of the form
// {cacheInfo: ,
//  repo: }
const m_deletionQueue = [];

function findInDeletionQueue(distro, repo, cacheInfo)
{
    return m_deletionQueue.find(deletionInfo => deletionInfo.distro === distro && deletionInfo.repo === repo && deletionInfo.cacheInfo === cacheInfo);
}

async function deleteCachedFile(distro, repo, cacheInfo)
{
    removeCacheInfo(distro, repo, cacheInfo);
    try {
        await fileUnlinkPromise(cacheInfo.dataFile);
        console.info('Cached file has been deleted:', cacheInfo.dataFile);
    }
    catch(err) {
        console.error('Couldn\'t delete cached file:', );
    }
}

let m_deletionsRunning = false;

async function performDeletions()
{
    if(m_deletionsRunning) {
        return;
    }

    m_deletionsRunning = true;

    while(m_deletionQueue.length > 0) {
        const deletionInfo = m_deletionQueue.shift();
        const cacheInfo = deletionInfo.cacheInfo;
        const distro = deletionInfo.distro;
        const repo = deletionInfo.repo;

        if(isCacheFileReadStreamConnected(cacheInfo)) {
            // the deletion will be scheduled when no reader is connected
            continue;
        }
        await deleteCachedFile(distro, repo, cacheInfo);
    }
    m_deletionsRunning = false;
    setImmediate(writeCachesToDisk);
}


function scheduleCachedFileDeletionRaw(distro, repo, cacheInfo)
{
    if(findInDeletionQueue(distro, repo, cacheInfo)) {
        // a deletion for this entry has already been scheduled;
        return;
    }
    cacheInfo.deletionScheduled = true;
    if(!cacheInfo.completelyDownloaded) {
        // the deletion will be scheduled when the download is complete
        return;
    }
    m_deletionQueue.push({distro: distro,
                          repo: repo,
                          cacheInfo: cacheInfo,
                         });
    setImmediate(performDeletions);
}

function scheduleCachedFileDeletion(distro, repo, releasever, basearch, path)
{
    scheduleCachedFileDeletionRaw(distro, repo, getCacheInfo(distro, repo, releasever, basearch, path));
}

/* Currently, we have a very simple caching strategy:
 * files ending in *.rpm or *.drpm are cached, all others are not
 */
async function fileRequested(distro, repo, releasever, basearch, path, incomingRes)
{
    if(m_config.logRequests) {
        console.log('file requested:', distro, repo, releasever, basearch, path);
    }

    if(!m_config.hasOwnProperty('repos')
        || !m_config.repos.hasOwnProperty(distro)
        || !m_config.repos[distro].hasOwnProperty(repo)) {
        incomingRes.sendStatus(404);
        incomingRes.end();

        if(m_config.logRequests) {
            console.log('\tunknown distro or repository:', distro, repo);
        }

        return;
    }

    if(!path.endsWith(".rpm") && !path.endsWith(".drpm")) { // we only cache rpm files
        if(m_config.logRequests) {
            console.log('\tnot using cache');
        }
        await downloadAndTransfer(distro, repo, releasever, basearch, path, incomingRes);
        return;
    }

    const cacheInfo = getCacheInfo(distro, repo, releasever, basearch, path);

    if(cacheInfo.completelyDownloaded) {
        if(m_config.logRequests) {
            console.log('\talready completely downloaded; transferring from cache');
        }
        await continuouslyTransferFile(distro, repo, releasever, basearch, path, incomingRes);
    }
    else if(cacheInfo.downloading) {
        if(m_config.logRequests) {
            console.log('\tdownload in progress; transferring from cache');
        }
        await continuouslyTransferFile(distro, repo, releasever, basearch, path, incomingRes);
    }
    else {
        if(m_config.logRequests) {
            console.log('\tdownloading...');
        }
        await downloadAndDistribute(distro, repo, releasever, basearch, path, incomingRes);
    }
}

function isCacheFileReadStreamConnected(cacheInfo)
{
    return cacheInfo.readersArray.length > 0;
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

async function continuouslyTransferFile(distro, repo, releasever, basearch, path, incomingRes)
{
    const cacheInfo = getCacheInfo(distro, repo, releasever, basearch, path);

    const cachedFileReadStream = new CachedFileReadStream(cacheInfo, incomingRes);
    addCacheFileReadStream(cachedFileReadStream, cacheInfo);

    cachedFileReadStream.on('end', function() {
                                        incomingRes.end();
                                        removeCacheFileReadStream(cachedFileReadStream, cacheInfo);
                                        if(cacheInfo.deletionScheduled) {
                                            scheduleCachedFileDeletionRaw(distro, repo, cacheInfo);
                                        }
                                   });

    const headers = {'content-type': 'application/octet-stream'};
    if(cacheInfo.predictedContentLength) {
        headers['content-length'] = cacheInfo.predictedContentLength;
    }
    incomingRes.writeHead(200, headers);

    cachedFileReadStream.pipe(incomingRes);
}

function constructDownloadURL(distro, repo, releasever, basearch, path)
{
    if(!m_config.hasOwnProperty('repos')
        || !m_config.repos.hasOwnProperty(distro)
        || !m_config.repos[distro].hasOwnProperty(repo)
        || !m_config.repos[distro][repo].hasOwnProperty('downloadURL')) {
        throw 'Repo ' + repo + ' for distro ' + distro + ' not configured correctly!';
    }

    const rawRepoURL = m_config.repos[distro][repo].downloadURL;

    let repoURL = rawRepoURL.replace(/\$releasever/g, releasever);
    repoURL = repoURL.replace(/\$basearch/g, basearch);
    repoURL = utils.ensureEndsWithSlash(repoURL) + path;
    return repoURL;
}

async function downloadAndTransfer(distro, repo, releasever, basearch, path, incomingRes) {

    const url = constructDownloadURL(distro, repo, releasever, basearch, path);

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
        console.error('WARNING: an error occurred while downloading:', distro, repo, releasever, basearch, path);
    }
}

async function downloadAndDistribute(distro, repo, releasever, basearch, path, incomingRes)
{
    const cacheInfo = getCacheInfo(distro, repo, releasever, basearch, path);

// introduce cacheInfo.downloadIsBeingSetup state...
    cacheInfo.downloadedLength = 0;
    const diskPath = getDiskPath(distro, repo, releasever, basearch, path);
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
            console.log('download complete for', distro, repo, releasever, basearch, path);
        }
        cacheInfo.downloading = false;
        cacheInfo.completelyDownloaded = true;
        cacheInfo.downloadFinishedAt = new Date();
        setImmediate(writeCachesToDisk);
        if(cacheInfo.deletionScheduled) {
            scheduleCachedFileDeletionRaw(distro, repo, cacheInfo);
        }
    }

    function handleError(error) {
        console.error('An error occurred:', error);
        cacheInfo.downloading = false;
    }

    cacheInfo.completelyDownloaded = false;

    const url = constructDownloadURL(distro, repo, releasever, basearch, path);

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

        continuouslyTransferFile(distro, repo, releasever, basearch, path, incomingRes);
    }
    catch(error) {
        console.error('WARNING: an error occured while downloading:', error);
    }
}

function getCacheOverview()
{
    const toReturn = {};
    for(const [distro, repoCacheMap] of m_cacheMapForDistro) {
        const distroObject = {};
        for(const [repo, cacheMap] of repoCacheMap) {
            const repoArray = [];
            for(const [relativePath, cacheInfo] of cacheMap) {
                const entry = {};
                entry.downloadedLength = cacheInfo.downloadedLength;
                if(cacheInfo.hasOwnProperty('downloadFinishedAt')) {
                    entry.downloadFinishedAt = (cacheInfo.downloadFinishedAt).getTime();
                }
                entry.completelyDownloaded = cacheInfo.completelyDownloaded;
                entry.deletionScheduled = cacheInfo.deletionScheduled || false;
                entry.releasever = cacheInfo.releasever;
                entry.basearch = cacheInfo.basearch;
                entry.relativePath = getRealRelativePathFromCacheInfo(distro, repo, cacheInfo);
                repoArray.push(entry);
            }
            distroObject[repo] = repoArray;
        }
        toReturn[distro]  = distroObject;
    }
    return toReturn;
}

async function init(config)
{
    m_config = config;
    if(!m_config.hasOwnProperty('cacheDir')) {
        console.error('No cache directory configured!');
    }
    m_config.cacheDir = utils.ensureEndsWithSlash(m_config.cacheDir);
    m_cacheDataDir = m_config.cacheDir + 'cache-data/';

    for(let distro in m_config.repos) {
        if(!m_config.repos.hasOwnProperty(distro)) {
            continue;
        }
        for(let repoName in m_config.repos[distro]) {
            if(!m_config.repos[distro].hasOwnProperty(repoName)) {
                continue;
            }
            console.log('Initializing repo \'' + repoName + '\'' + ' for \'' + distro + '\'');
            await readCacheFromDisk(distro, repoName);
        }
    }
}

module.exports = {fileRequested: fileRequested,
                  init: init,
                  writeCachesToDisk: writeCachesToDisk,
                  getCacheOverview: getCacheOverview,
                  scheduleCachedFileDeletion: scheduleCachedFileDeletion,
                  containsCachedFile: containsCachedFile,
                 };

// kate: space-indent on; indent-width 4; mixedindent off;
