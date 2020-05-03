//  cached-file-stream.js
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

const stream = require('stream');
const fs = require('fs');

class CachedFileReadStream extends stream.Readable {

    constructor(cacheInfo, incomingRes, options)
    {
        super();
        this.m_cacheInfo = cacheInfo;
        this.m_incomingRes = incomingRes;
        this.m_pushInProgress = false;
        this.m_pushStillPossible = true;
        this.m_bytesWritten = 0;
        this.m_BUFFER_SIZE = 1024 * 1024;
        this.m_buffer = Buffer.alloc(this.m_BUFFER_SIZE, 0);
        this.m_fd = null;
    }

    _read(size)
    {
        this.m_pushStillPossible = true;
        this.tryToPushData();
    }

    readInReactionToBytesWritten()
    {
        this.tryToPushData();
    }

    tryToPushData()
    {
        if(this.m_pushInProgress || !this.m_pushStillPossible) {
            return;
        }
        if(!this.m_cacheInfo.dataFile) { // dataFile is not set up yet
            return;
        }

        if(this.m_fd === null) {
            fs.open(this.m_cacheInfo.dataFile, 'r', (err, fd) => {
                    if(err) {
                        //TODO: add error handling
                        // special case: file doesn't exist (yet), then we can just return; the file will be created sooner or later
                        return;
                    }
                    this.m_fd = fd;
                    this.tryToPushData();
                });
            return;
        }

        this.m_pushInProgress = true;

        fs.read(this.m_fd, this.m_buffer, 0, this.m_BUFFER_SIZE, this.m_bytesWritten, (err, bytesRead, data) => {
                    if(err) {
                        this.m_pushInProgress = false;
                        this.emit('error', err);
                        return;
                    }
                    this.dataRead(bytesRead, data);
                });
    }

    dataRead(nrBytesActuallyRead, data)
    {
        const reachedEOF = nrBytesActuallyRead < this.m_BUFFER_SIZE;

        this.m_pushInProgress = false;
        this.m_bytesWritten += nrBytesActuallyRead;

        if(nrBytesActuallyRead > 0) {
            const pushBuffer = Buffer.allocUnsafe(nrBytesActuallyRead);
            this.m_buffer.copy(pushBuffer, 0, 0, nrBytesActuallyRead);

            if(!this.push(pushBuffer)) {
                this.m_pushStillPossible = false;
                return;
            }
        }

        if(reachedEOF && this.m_cacheInfo.completelyDownloaded) {
            if(this.m_fd) { // can be null when fileOpenPromise failed
                fs.close(this.m_fd, (err) => {
                                                if(err) { //TODO: improve error handling
                                                    this.emit('error', err);
                                                }
                                             });
                this.m_fd = null;
            }
            this.push(null);
        }
        else {
            this.tryToPushData();
        }
    }
}

module.exports = {CachedFileReadStream: CachedFileReadStream};

// kate: space-indent on; indent-width 4; mixedindent off;
