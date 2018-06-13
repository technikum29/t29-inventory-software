#!/bin/sh
for x in {100..150}; do qrencode -t SVG -m0 -o $x.svg $x; inkscape $x.svg --export-pdf=$x.pdf; done
