const stream = require('stream');
const fs = require('fs');

class CachedFileReadStream extends stream.Readable {

    constructor(cacheInfo, incomingRes, options)
    {
//         super({encoding: 'binary'});
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
// console.log('bytes were written');
        this.tryToPushData();
    }

    tryToPushData()
    {
// console.log('entering tryToPushData, fd is', this.m_fd, this.m_bytesWritten, this.m_cacheInfo.downloadedLength);

        if(this.m_pushInProgress || !this.m_pushStillPossible) {
// console.log('push in in progress or push is not possible any more');
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
//                         this.emit('error', err);
                        return;
                    }
// console.log('file is open');
                    this.m_fd = fd;
                    this.tryToPushData();
                });
            return;
        }

        this.m_pushInProgress = true;

        if(this.m_bytesWritten < this.m_cacheInfo.downloadedLength) {
// console.log('\tif 1');
            const readSize = Math.min(this.m_BUFFER_SIZE, this.m_cacheInfo.downloadedLength - this.m_bytesWritten);

            fs.read(this.m_fd, this.m_buffer, 0, readSize, this.m_bytesWritten, (err, bytesRead, data) => {
                        if(err) {
                            this.m_pushInProgress = false;
                            this.emit('error', err);
                            return;
                        }
                        this.dataRead(bytesRead, data);
                    });
        }
        else {
            if(this.m_cacheInfo.completelyDownloaded) {
// console.log('\tif 2');
                this.push(null);
            }
            this.m_pushInProgress = false;
        }

    }

    dataRead(bytesActuallyRead, data)
    {
        this.m_pushInProgress = false;
// console.log('data has been read', bytesActuallyRead);
        this.m_bytesWritten += bytesActuallyRead;

        const pushBuffer = Buffer.allocUnsafe(bytesActuallyRead);
        this.m_buffer.copy(pushBuffer, 0, 0, bytesActuallyRead);

        if(!this.push(pushBuffer)) {
// console.log('pushing is no longer possible');
            this.m_pushStillPossible = false;
            return;
        }
// console.log('pushed', this.m_bytesWritten, 'to', this.m_fd);

        if(this.m_bytesWritten === this.m_cacheInfo.downloadedLength && this.m_cacheInfo.completelyDownloaded) {
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
