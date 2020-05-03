# Lazy mirror for RPM packages

This is a lazy mirror for RPM packages running on Node.js. You can point your Fedora/CentOS boxes to a machine running the lazy package mirror to speed up the downloading of RPM packges. The lazy package mirror will download the packages once from the Internet and cache them for the Linux boxes in your local network. In this way, packages will have to be downloaded only once from the Internet.

Still work in progress, but it is usable already.

## TODO

* Add admin interface
* ...

## Installation

We assume that the lazy package mirror is installed on machined named 'fileserver'.

1. Ensure that node.js and npm are installed, e.g. on Fedora:
   ```
   dnf install nodejs npm
   ```
2. Clone this git repository under '/opt'

3. In '/opt/lazy-package-mirror/' run 'npm install'

4. Create a cache directory, e.g. /var/cache/lazy-package-mirror/

5. Create a file name 'lazy-package-mirror.conf' under '/etc/lazy-package-mirror/' following the example below:

   ```
   listenPort = 7000
   cacheDir = /var/cache/lazy-package-mirror/
   hostName = fileserver
   logRequests = false

   [repo:fedora]
   downloadURL = http://ftp-stud.hs-esslingen.de/Mirrors/fedora.redhat.com/linux/releases/$releasever/Everything/$basearch/os/

   [repo:updates]
   downloadURL = http://ftp-stud.hs-esslingen.de/Mirrors/fedora.redhat.com/linux/updates/$releasever/Everything/$basearch/
   ```
6. Start the lazy mirror with 'node lazy-package-mirror' in '/opt/lazy-package-mirror/'
