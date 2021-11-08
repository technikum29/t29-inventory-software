#!/bin/bash

workdir="/tmp/inv-work"
mkdir -p $workdir


for inv in $(seq 1200 1210); do
    echo "Generating SVG for $inv"
    ./generate-svg-label.py $inv > $workdir/$inv.svg
    echo "Generating PDF for $inv"
    inkscape --export-filename="$workdir/$inv.pdf" $workdir/$inv.svg
done

popd
echo "Joining all PDFs..."

pdftk $workdir/*.pdf cat output D-series.pdf
