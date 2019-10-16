#!/bin/bash
#
# Generate preview pictures from original "big" pictures.
# Quick & dirty for the time being.
# Written offline in train, 2019-05-16 SvenK
#

# TBD: Read configuration from assets_config.json using jq.

# directories where to read from and write to
#ORIGINALS="2019-05-09 Fotos" # Rohbilder 2019-05-09"
ORIGINALS="2019-07 Fotos"
SMALL="resize-cache"

mkdir -p "$SMALL/$ORIGINALS"

for img in "$ORIGINALS"/*.jpg; do
	echo "Making smaller version of $img "
	smaller="$SMALL/$ORIGINALS/$(basename "$img")"
	[ -e "$smaller" ] && [ "$smaller" -nt "$img" ] && continue
	convert -resize 700x "$img" "$SMALL/$ORIGINALS/$(basename "$img")"
done

# Make a square thumbnail version.
# Thanks to the low quality, they are super small (<10kB). 
for img in "$SMALL"/*/*.jpg; do
	echo "Making thumbnail for $img"
	thumb="${img}.thumb.jpg"
	[ -e "$thumb" ] && [ "$thumb" -nt "$img" ] && continue
	convert -define jpeg:size=600x600 "$img" \
		-thumbnail 400x400^ -gravity center -extent 300x300 \
		-unsharp 0x.5 -quality 40 -sampling-factor 2x1 \
		"$thumb"
done
