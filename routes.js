//  routes.fs
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


module.exports = function(app, cache, config) {

app.get('/repo-data/', async (req, res) => {
    const toSend = {};
    if(!config.hasOwnProperty('repos')) {
        res.send(toSend);
        return;
    }

    for(let distro in config.repos) {
        const reposToSend = {};
        for(let repo in config.repos[distro]) {
            if(!config.repos[distro].hasOwnProperty(repo)) {
                continue;
            }
            reposToSend[repo] = {url: 'http://' + config.hostName + ':' + config.listenPort + '/cache/' + distro + '/' + repo + '/$releasever/$basearch/'};
        }
        toSend[distro] = reposToSend;
    }
    res.send(toSend);
});

app.get('/repo-data/:distro/', async (req, res) => {
    const distro = req.params.distro;

    const reposToSend = {};
    if(!config.hasOwnProperty('repos')) {
        res.send(reposToSend);
        return;
    }

    for(let repo in config.repos[distro]) {
        if(!config.repos[distro].hasOwnProperty(repo)) {
            continue;
        }
        reposToSend[repo] = {url: 'http://' + config.hostName + ':' + config.listenPort + '/cache/' + distro + '/' + repo + '/$releasever/$basearch/'};
    }
    res.send(reposToSend);
});

app.get('/cache/:distro/:repo/:releasever/:basearch/:path(*)', async (req, res) => {
    const distro = req.params.distro;
    const repo = req.params.repo;
    const releasever = req.params.releasever;
    const basearch = req.params.basearch;
    const path = req.params.path;

    try {
        await cache.fileRequested(distro, repo, releasever, basearch, path, res);
    }
    catch(error) {
        console.log('error', error);
    }

});

app.get('/api/v1/cache/overview/', (req, res) => {
//     const repo = req.params[0];
//     const releasever = req.params[1];
//     const basearch = req.params[2];
//     const path = req.params[3];
//
//     try {
//         res.status(200);
//
//         await cache.fileRequested(repo, releasever, basearch, path, res);
//     }
//     catch(error) {
//         console.log('error', error);
//     }
    res.send(cache.getCacheOverview());
});

app.get('/api/v1/cache/delete/:distro/:repo/:releasever/:basearch/:path(*)', async (req, res) => {
    const distro = req.params.distro;
    const repo = req.params.repo;
    const releasever = req.params.releasever;
    const basearch = req.params.basearch;
    const path = req.params.path;

    if(!cache.containsCachedFile(distro, repo, releasever, basearch, path)) {
        res.sendStatus(404);
        return;
    }

    try {
        cache.scheduleCachedFileDeletion(distro, repo, releasever, basearch, path);
        res.sendStatus(200);
    }
    catch(error) {
        console.log('error', error);
        res.sendStatus(500);
    }
});

app.get('*', function(req, res) {
  res.redirect('/admin');
});

}

// kate: space-indent on; indent-width 4; mixedindent off;
