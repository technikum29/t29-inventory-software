A simple PHP-based viewer for the JSON based inventory database
===============================================================

This directory contains a minimal PHP based website which dynamically
renders the content of the JSON inventory database (on request). There
is no further Javascript magic, which puts it into contrast of the
highly advanced but demanding "Inventory editor" software.

This page scales well for thousands of inventory entries and media
without any further tricks.

While this code consists only of a couple of PHP lines, there is
a dependency to the overall technikum29.de website system, which
allows for integration into layout and usage of the navigation system.

Installation
------------

   git clone https://github.com/technikum29/technikum29-www.git
   git clone https://github.com/technikum29/t29-inventory-software.git
   cd t29-inventory-software/viewer
   ln -s ../../technikum29-www/lib
   mv lib t29-lib

Then just serve this directory in your standard LAMP webserver, for
instance

   cd /var/www
   ln -s "$OLDPWD"
   browse "http://localhost/t29-inventory-software/viewer"

