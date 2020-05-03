# Lazy mirror for RPM packages

This is a lazy mirror for RPM packages running on Node.js. You can point your Fedora/CentOS boxes to a machine running the lazy package mirror to speed up the downloading of RPM packges. The lazy package mirror will download the packages once from the Internet and it will cache them for the Linux boxes in your local network. In this way, packages will have to be downloaded only once from the Internet and you don't have to maintain a complete mirror of your distribution's package repositories.

Still work in progress, but it is usable already.

The lazy package mirror works together with the [DNF plugin for detecting local mirrors](https://github.com/michel-ludwig/dnf-local-mirror-detection).

## TODO

* Add admin interface
* ...

## Installation

We assume that the lazy package mirror is installed on machined named 'fileserver'.

1. Ensure that node.js and npm are installed, e.g. on Fedora:
   ```
   # dnf install nodejs npm
   ```
2. Create a system user 'lpm' with home directory '/opt/lazy-package-mirror':
   ```
   # mkdir /opt/lazy-package-mirror
   # useradd --home-dir=/opt/lazy-package-mirror --system --user-group lpm
   # chown lpm:lpm /opt/lazy-package-mirror
   ```
3. Create a cache directory, e.g. /var/cache/lazy-package-mirror/
   ```
   # mkdir /var/cache/lazy-package-mirror/
   ```
4. Clone this git repository
   ```
   # cd /opt
   # sudo -H -u lpm git clone https://github.com/michel-ludwig/lazy-package-mirror.git
   ```
5. In '/opt/lazy-package-mirror/' run 'npm install'
   ```
   # cd /opt/lazy-package-mirror/
   # sudo -H -u lpm npm install
   ```
5. Create a file named 'lazy-package-mirror.conf' under '/etc/lazy-package-mirror/' following the example below:

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
6. Set the owner and the permissions:
   ```
   # chown lpm:lpm /etc/lazy-package-mirror/lazy-package-mirror.conf
   # chmod 600 /etc/lazy-package-mirror/lazy-package-mirror.conf
   ```

6. Run the lazy mirror with 'node lazy-package-mirror' in '/opt/lazy-package-mirror/'
   ```
   # cd /opt/lazy-package-mirror
   # sudo -H -u lpm node lazy-package-mirror
   ```
