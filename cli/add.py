#!/usr/bin/env python3
#
# Add an record to the JSON database per Command Line Interface.
# Arguments which are given add command line are asked for interactively.
# Will insert one record per call.

import argparse, sys, json, datetime

today = datetime.date.today().strftime("%d.%m.%Y")

parser = argparse.ArgumentParser(description="Command Line Inventory addition")
parser.add_argument("--infile", nargs="?", default="-", help="JSON file to read from (default: read from stdin)")
parser.add_argument("--outfile", nargs="?", default="-", help="File where to write to (default: overwrite infile if given. If reading from stdin, will default to stdout)")

parser.add_argument("--ask", nargs="*", default=["Inv-Nr.", "Objekt", "Beschreibung"], help="Fields to ask values interactively for")
parser.add_argument("--set", nargs="*", default=["Datum="+today], help="Fields to fix at calling time, syntax k=v")
args = parser.parse_args()

### Reading in JSON database just as in canonicalize.py

i, o = args.infile == "-", args.outfile == "-"

with (open(args.infile, "r") if not i else sys.stdin) as ifh:
	data = json.load(ifh)

### Work begins here

while True:
    record = {}

    for kv in args.set:
        k,v = kv.split("=")
        record[k] = v

    for k in args.ask:
        record[k] = input(k+ "> ")

    json.dump(record, sys.stderr, indent=4, sort_keys=True)
    yn = input(". Store these data? [Yn] > ").lower()
    if yn.startswith("y") or yn=="": break
    else: print("Starting over with data input.", file=sys.stderr)
    
data.append(record)    

if not i and o:  ofh = open(args.infile, "w")
elif not o:      ofh = open(args.outfile, "w")
else:            ofh = sys.stdout

print(f"Writing to {ofh=}, since {i=} and {o=}", file=sys.stderr)
json.dump(data, ofh, indent=4, sort_keys=True)
print("", file=ofh) # print newline

