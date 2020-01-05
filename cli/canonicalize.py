#!/usr/bin/env python3
#
# Bring a JSON file into canonical form.
# This is important for having useful git diff's on the db git

import argparse, sys, json

parser = argparse.ArgumentParser(description="Canonicalizer for Inventory JSON files")
parser.add_argument("infile", nargs="?", default="-", help="JSON file to canonicalize (default: read from stdin)")
parser.add_argument("outfile", nargs="?", default="-", help="File where to write to (default: overwrite infile if given. If reading from stdin, will default to stdout)")
args = parser.parse_args()

i, o = args.infile == "-", args.outfile == "-"

with (open(args.infile, "r") if not i else sys.stdin) as ifh:
	data = json.load(ifh)

if not i and o:  ofh = open(args.infile, "w")
elif not o:      ofh = open(args.outfile, "w")
else:            ofh = sys.stdout

#print(f"Writing to {ofh=}, since {i=} and {o=}", file=sys.stderr)
json.dump(data, ofh, indent=4, sort_keys=True)
print("", file=ofh) # print newline
