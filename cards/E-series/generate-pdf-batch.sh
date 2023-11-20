#!/bin/bash

workdir="/tmp/inv-work"
mkdir -p $workdir

# start with 1, this makes multi page PDF numbering easier for humans!
for inv in $(seq 1301 1340); do
    echo "Generating SVG for $inv"
    ./generate-svg-label.py $inv > $workdir/$inv.svg
    echo "Generating PDF for $inv"
    inkscape --export-filename="$workdir/$inv.pdf" $workdir/$inv.svg
done

popd
echo "Joining all PDFs..."

pdftk $workdir/*.pdf cat output E-series.pdf
