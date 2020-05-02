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

app.get(/repo-data/, async (req, res) => {
    const reposToSend = {};
    if(!config.hasOwnProperty('repos')) {
        res.send(reposToSend);
        return;
    }

    for(let repo in config.repos) {
        if(!config.repos.hasOwnProperty(repo)) {
            continue;
        }
        reposToSend[repo] = {url: 'http://' + config.hostName + ':' + config.listenPort + '/cache/' + repo + '/$releasever/$basearch/'};
    }
    res.send(reposToSend);
});

app.get(/^\/cache\/([a-zA-Z0-9\-]+)\/([0-9]+)\/([a-zA-Z0-9_]+)\/(.+)/, async (req, res) => {
    const repo = req.params[0];
    const releasever = req.params[1];
    const basearch = req.params[2];
    const path = req.params[3];

    try {
        res.status(200);

        await cache.fileRequested(repo, releasever, basearch, path, res);
    }
    catch(error) {
        console.log('error', error);
    }

});


}

// kate: space-indent on; indent-width 4; mixedindent off;
