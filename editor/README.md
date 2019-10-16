A reactive single-page application inventory viewer and editor
==============================================================

This directory holds the technikum29 inventory viewer and editor
software. It is build using [Vue.js](https://vuejs.org/) for
the client side and a rather dumb
[Tornado](https://www.tornadoweb.org/)-based Python webserver.

The whole project was carried out by SvenK at Summer 2019. All
code is *public domain*.

General outline
---------------

This tool is supposed to provide an extensive user interface
around the technikum29 inventory data format (which is described
in the README file in the parent directory). The key features
originally intended were:

  * A generic editor for a set of structured ([JSON](https://json.org/))
    documents, in particular of a JSON document supported by a
    [JSON Schema](https://json-schema.org/) which should be editable
    itself.
  * Full version control of edits (using git)
  * Preservation/Synchronisation of data and changes across clients
    or only different tabs on the same device. This was supposed
    to be implemented by life-time concurrency by JSON operational
    transformations
    (for instance using [Palindrome](https://github.com/Palindrom/JSON-Patch-OT)).
  * Multi platform (thus web) and Offline usable
  * Data friendly (allowing import/export in other formats)
  * Low-treshold for participation by making anything editable
    without login (or late/lazy authentification)
  * Full view-only features such as searching, browsing,
    media handling
  * Fully reactive user interface (modern two way data binding)

It rather quickly turned out that many of these archievements
could not be archieved in limited time with a single developer. By now,
the software can in fact do the following:

  * Allows a nice *read only* support, also with a static fallback
    in case the application server does not respond.
  * Support for JSON Schema.
  * Usage of [localStorage](https://developer.mozilla.org/de/docs/Web/API/Window/localStorage) for
    restoring changes after closing the browser window.
  * Basic pushing and pulling over the HTTP application server.
  * Markdown support for text types.
  * Basic managament of images (order, association).
  * Relatively small code base 
  * Works in all major browsers

However, the following *limitations* are known:

  * We lack a full support for operational transformations
    (basically because I didn't want to use 
    [Palindrome](https://github.com/Palindrom/JSON-Patch-OT), i.e.
    JavaScript on the server side. I wanted to keep the server side
    slim).
  * Git merge conflicts are not handled. In such a case,
    changes are overwritten (this is not fatal: Any changes can
    be tracked in the git log).
  * The JSON schema does not support (or has incomplete support of)
    nested data structures, i.e. dictionary and list types. Thus,
    only "flat" or "scalar" *records* can be edited.
  * The media handling is very limited.
  * Vue.js shows severe performance drops at more then 1000 reactive
    elements per page, or more then 1000 inventory items. I tried
    to circumvent these limitations with workarounds, but my
    choice for *not* using pagination has performance results.
  * The life search is very slow even on fast computers, since
    it updates the view at *every* key stroke (by intention).
    This should be changes.

The following *bugs* are known:

  * The application server tends to crash regularly. It basically
    needs a rewrite as a traditional WSGI application. This choice
    was not made initially due to a (stateful) Websocket connection
    which is however no more made use of.

The client
----------

The client software can be found in the `app/` subdirectory. It
started as my experiment to build a modern *progressive web
application*. In the current state, it is quite overengineered.

The server
----------

The server software is written in a single Python3 file called
`t29-inventory-webserver.py` and containing further instructions.
It can serve the directory content and thus is suitable for being
used as standalone.

Installation
------------

The code makes use of a number of softlinks:

  * `./inventory` should point to the directory holding your
    inventory database, i.e the directory layout should be like

        inventory
        ├── inventory.json
        ├── media.json
        ├── schema.json
        └── update-from-csv.py

  * `./media` should point to your media directory, for
    instance

        media
        ├── 2019-05-09 Fotos -> /path/to/my/actual-photo-repository
        ├── 2019-05-10 Fotos -> /path/to/another-photo-repository
        ├── generate-json-assignment.py
        ├── generate-smaller-versions.sh
        ├── placeholder.svg
        ├── resize-cache
        │   └── 2019-05-09 Fotos
        │   └── 2019-05-10 Fotos
        └── upload

There is a configuration file called `inventory-editor-config.json`
which serves *both* as the common ground for client and server
configuration. It contains further comments about the paths.

