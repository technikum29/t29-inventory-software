Inventory managament made for geeks
===================================

This repository contains software to manage the inventory
of the [technikum29 computer museum](https://technikum29.de).
It consists of the following parts:

  * [Inventory cards](cards/): Latex templates for generating
    printable tags. Also contains small tools for computer aided
    rapid inventarization/inventory procession.
  * [Inventory editor and viewer App](editor/): A progressive
    web application, i.e. JavaScript browser client for exploring
    and editing an inventory database.
  * [Another simple PHP-based inventory viewer](viewer/):
    Basically demonstrates the ease of rendering the inventory
    database to web.
  * [PDF/Printable report generator](printable-reports/):
    Python script to generate Latex from an inventory database,
    which can be compiled to PDF.

This software suite is built around the
[JSON inventory database format](database-format.md), a particular
and easy format to store an inventory database. It is discussed
in the file [database-format.md](database-format.md). This format
was chosen because it is very easy to get startet in virtually any
programming language to process and display items of the database.
Therefore, I call this *inventory managament made for geeks*,
who like to use explorative programming and their favourite Unix
shell.

All software in this repository was written in 2019 by *SvenK*
and is released as *Public Domain*.