# lazy-package-mirror

## Installation

1. Ensure that node.js and npm are installed

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
