//  utils.js
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

function roundTo3Digits(num)
{
    return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

function dataSizeToUserString(sizeInBytes)
{
    if(sizeInBytes < 1024) {
        return sizeInBytes + ' bytes';
    }
    else if(sizeInBytes < 1024 * 1024) {
        return roundTo3Digits(sizeInBytes / 1024) + ' kiB';
    }
    else if(sizeInBytes < 1024 * 1024 * 1024) {
        return roundTo3Digits(sizeInBytes / (1024 * 1024)) + ' MiB';
    }
    else {
        return roundTo3Digits(sizeInBytes / (1024 * 1024 * 1024)) + ' GiB';
    }
}

function removeAllChildren(element)
{
    while (element.hasChildNodes()) {
        element.removeChild(element.lastChild);
    }
}

function makeTextLink(linkText, onClickFunction)
{
    const a = makeLink(onClickFunction);
    const domLinkText = document.createTextNode(linkText);
    a.appendChild(domLinkText);
    return a;
}

function makeLink(onClickFunction)
{
    const a = document.createElement('a');
    a.addEventListener('click', onClickFunction);
    a.href = '#';
    return a;
}

function makeButton(text, onClickFunction)
{
    const button = document.createElement('button');
    button.addEventListener('click', onClickFunction);
    button.href = '#';
    button.textContent = text;
    return a;
}

function makeListElement()
{
    return document.createElement('li');
}

function showElement(element)
{
    element.classList.remove('d-none');
}

function hideElement(element)
{
    element.classList.add('d-none');
}

async function fetchJSONAsync(url) {
    const response = await fetch(url, {method: 'get'});

    if(!response.ok) {
        throw 'Response was not ok';
    }
    return await response.json();
}

async function fetchAsync(url) {
    const response = await fetch(url, {method: 'get'});

    return response.ok;
}

// kate: space-indent on; indent-width 4; mixedindent off;
