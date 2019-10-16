The technikum29 inventory database proposal
===========================================

The term *inventory database*, as used within this repository,
refers to a directory containing a number of JSON files:

     inventory/
     ├── inventory.json
     ├── media.json
     └── schema.json

These files store [JSON](https://json.org/) data. They are version
controlled by [git](https://git-scm.com/). In order to allow for
comprehensible diffs, they should be written in a *canonical* format,
for instance with one item per line, *4 spaces indent*, *sorted keys*.
Such *canonicalization* is typically done by some post processing with
a standard tool, such as [jq](https://stedolan.github.io/jq/):

    jq --indent 4 < inventory.json | sponge inventory.json

Choosing a flat file database vs. a relational database
-------------------------------------------------------

*to be written*


Inventory file
--------------

The `inventory.json` file itself is a *list of dictionaries*,
where each item in the list stores one *inventory item*. For instance,
an example valid inventory file is:

       [
           {
               "Bereich": "Werkstatt",
               "Beschreibung": "Einfach ein Beispiel",
               "Datum": "14.06.18",
               "Inv-Nr.": "101",
               "Label-Pos": "hinten rechts",
               "Objekt": "Foo Bar Gerät",
               "Ort": "M66",
               "Serie": "A-3x9"
           },
           {
               "Bereich": "Werkstatt",
               "Beschreibung": "Zweiter Eintrag",
               "Datum": "14.06.18",
               "Inv-Nr.": "102",
               "Label-Pos": "vorne unten",
               "Objekt": "DEC-Schrank ABC",
               "Ort": "M66",
               "Serie": "A-3x9"
           },
           {
               "Bereich": "Werkstatt",
               "Beschreibung": "Mit drei Lochstreifenlesern, usw.",
               "Datum": "14.06.18",
               "Inv-Nr.": "103",
               "Label-Pos": "vorne unten",
               "Objekt": "DEC-Schrank",
               "Ort": "M66",
               "Serie": "A-3x9"
           }
       ]

This file is written in German language: Both keys and values are German. Furthermore,
there are a number of *fields*, which all are of type *string* in this particular
example. Note the standard indent and sorting of keys.

Schema file
-----------

The meaning of the keys is explained by the [JSON Schema](https://json-schema.org/)
file called `schema.json`. While the primary job of a Schema is to define the allowed
structure of a file, we *enrich* the JSON Schema with supplementary information
about the fields, such as:

  * `examples`: Exemplary field values
  * `title`: Human readable short description of the field
  * `type`: Supposed data type of the field (to distinguish, for instance, `string`
    from `markdown`.
  * `editor`: The supposed editor widget (used for instance in the *inventory editor*).
    `editor=select` indicates a drop down whereas `editor=multiline` indicates a
    multiline string.

Here is an example of the schema file as it is used in the technikum29 inventory
database:

       {
           "$comment": "JSON-Schema (alike) for a record in the t29 inventory table",
           "$id": "http://technikum29.de/inv/schema.json",
           "$schema": "http://json-schema.org/draft-04/hyper-schema",
           "properties": {
               "Absicht": {
                   "editor": "select",
                   "examples": [
                       "Teil der Ausstellung",
                       "Verkaufen",
                       "Wegwerfen/Schrott"
                   ],
                   "title": "Handlungsabsicht mit diesem Inventar",
                   "type": "string"
               },
               "Bereich": {
                   "editor": "select",
                   "editor_flags": {
                       "restrict_options_by": "Ort"
                   },
                   "examples": [
                       "Keller 1",
                       "Werkstatt",
                       "Gartenhaus",
                       "UG"
                   ],
                   "title": "Raum in der Immobilie",
                   "type": "string",
                   "order": 5
               },
               "Beschreibung": {
                   "editor": "multiline",
                   "examples": [
                       "HP85, Bildschirm defekt"
                   ],
                   "title": "Kurzbeschreibung (pr\u00e4gnanter Satz), danach beliebig ausf\u00fchrlich",
                   "type": "markdown",
                   "order": 2
               },
               "Datum": {
                   "examples": [
                       "14.06.18"
                   ],
                   "immutable": true,
                   "show_unique_values_in_schema_editor": true,
                   "title": "Datum der Erstinventarisierung",
                   "type": "string",
                   "order": 3
               },
               "Inhalt": {
                   "editor": "list",
                   "examples": [
                       [
                           "Buch 1",
                           "Buch 2",
                           "Buch 3"
                       ],
                       [
                           "Netzteil XYZ",
                           "Bildschirm ABC",
                           "Prozessor DEF"
                       ]
                   ],
                   "items": {
                       "editor": "single-line",
                       "type": "string"
                   },
                   "title": "Bei mehrteiligen Inventariaten: Beschreibung der Einzelteile, zB. bei Regalen, Kisten, Ger\u00e4ten aus mehreren Bestandteilen.",
                   "type": "array"
               },
               "Inv-Nr.": {
       	    "primary-key": true,
                   "title": "Inventur-Nummer: Laufende Nummer des Inventariats",
                   "examples": [
                       "102",
                       "H301"
                   ],
                   "immutable": true,
                   "title": "Inventur-Nummer",
                   "type": "string",
                   "order": 0
               },
               "Label-Pos": {
                   "editor": "select",
                   "examples": [
                       "hinten rechts",
                       "vorne unten"
                   ],
                   "title": "Position der Klebe-Inventarmarke am Ger\u00e4t",
                   "type": "string"
               },
               "Objekt": {
                   "counterexamples": [
                       "Anita 85A-Rechner",
                       "Dell-Combitron",
                       "Holzregal"
                   ],
                   "editor": "select",
                   "editor_flags": {
                       "make-easy-to-add-option": true
                   },
                   "examples": [
                       "Tischrechner",
                       "Radio",
                       "Fernseher",
                       "Regal"
                   ],
                   "title": "Ein Wort, welches den Objekt-Typ beschreibt",
                   "type": "string",
                   "order": 1
               },
               "Ort": {
                   "editor": "select",
                   "examples": [
                       "M66",
                       "AF29",
                       "FR4"
                   ],
                   "title": "Orts-Beschreibung (nur Immobilie)",
                   "type": "string",
                   "order": 4
               },
               "Preis": {
                   "editor": "single-line",
                   "examples": [
                       "< 100\u20ac bei eBay",
                       "100-200EUR",
                       "wertlos"
                   ],
                   "title": "Preisvorstellungen (gerne mit Kommentar oder Link)",
                   "type": "string"
               },
               "Zustand": {
                   "editor": "select",
                   "editor_flags": {
                       "make-easy-to-add-option": true
                   },
                   "examples": [
                       "Ohne Geh\u00e4use",
                       "Vergilbt",
                       "Einwandfrei und funktionsf\u00e4hig"
                   ],
                   "title": "Knappe Beschreibung des Zustandes",
                   "type": "string"
               }
           },
           "type": "object"
       }






