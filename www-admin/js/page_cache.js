//  page_cache.js
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

const page_cache_content =
(function() {

    let m_repoCacheEntries =  null;

    const htmlContent = `
    <h1>Cache Content</h1>

    <p>
    <button id='cache_refresh_button'>Refresh</button>
    </p>

    <div id='cache_tables_hook'></div>
    `;

    async function scheduleCacheEntryDeletion(repo, releasever, basearch, path)
    {
        try {// '/api/v1/cache/delete/:repo/:releasever/:basearch/:path*'
            const result = await fetchAsync('/api/v1/cache/delete/' + repo + '/' + releasever + '/' + basearch + '/' + path);
            if(!result) {
                console.error('Deletion could not be scheduled!');
            }
            window.setTimeout(refreshTables, 0);
        }
        catch(error) {
            console.error(error);
        }
    }

    function addTableHeader(rowElement, textContent)
    {
        const tableCell = document.createElement('th');
        rowElement.appendChild(tableCell);
        tableCell.textContent = textContent;
    }

    function addTableCell(rowElement, textOrElement)
    {
        const tableCell = document.createElement('td');
        rowElement.appendChild(tableCell);
        if(textOrElement instanceof Element) {
            tableCell.appendChild(textOrElement);
        }
        else {
            tableCell.textContent = textOrElement;
        }
    }

    function fillTableRow(repo, rowElement, cacheEntry)
    {
        addTableCell(rowElement, cacheEntry.releasever);
        addTableCell(rowElement, cacheEntry.basearch);
        addTableCell(rowElement, cacheEntry.relativePath);
        addTableCell(rowElement, dataSizeToUserString(cacheEntry.downloadedLength));
        addTableCell(rowElement, cacheEntry.completelyDownloaded);
        addTableCell(rowElement, cacheEntry.deletionScheduled);
        const deletionLink = makeTextLink('Delete', async function() {
                                                        await scheduleCacheEntryDeletion(repo, cacheEntry.releasever, cacheEntry.basearch, cacheEntry.relativePath);
                                                    });
        addTableCell(rowElement, deletionLink);
    }

    function createTable(repo, cacheEntriesArray)
    {
        const tableRoot = document.createElement('table');

        {
            const rowElement = document.createElement('tr');
            tableRoot.appendChild(rowElement);

            addTableHeader(rowElement, 'releasever');
            addTableHeader(rowElement, 'basearch');
            addTableHeader(rowElement, 'Path');
            addTableHeader(rowElement, 'Size');
            addTableHeader(rowElement, 'Downloaded completly?');
            addTableHeader(rowElement, 'Deletion scheduled?');
        }

        for(let i = 0; i < cacheEntriesArray.length; ++i) {
            const cacheEntry = cacheEntriesArray[i];

            const rowElement = document.createElement('tr');
            tableRoot.appendChild(rowElement);

            fillTableRow(repo, rowElement, cacheEntry);
        }

        return tableRoot;
    }

    async function refreshTables()
    {
        const cacheTablesHook = document.getElementById('cache_tables_hook');
        removeAllChildren(cacheTablesHook);

        try {
            m_repoCacheEntries = await fetchJSONAsync('/api/v1/cache/overview/');
        }
        catch(error) {
            console.error(error);
        }

        for(let repo in m_repoCacheEntries) {
            if(!m_repoCacheEntries.hasOwnProperty(repo)) {
                continue;
            }

            const cacheEntries = m_repoCacheEntries[repo];

            const titleElement = document.createElement('h3');
            titleElement.textContent = 'Repository ' + repo;
            cacheTablesHook.appendChild(titleElement);

            const tableRoot = createTable(repo, cacheEntries);
            tableRoot.className = 'repositoryTable';
            cacheTablesHook.appendChild(tableRoot);
        }
    }

    async function init()
    {
        document.getElementById('cache_refresh_button').addEventListener('click', refreshTables);

        await refreshTables();
    }

    return {title: 'Cache Content',
            htmlContent: htmlContent,
            init: init,
           };
})();


// kate: space-indent on; indent-width 4; mixedindent off;
