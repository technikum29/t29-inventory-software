#!/usr/bin/env python3

"""
Export Inventory database to table (CSV, Excel, etc). If these files are only
edited in non-fancy ways (i.e. the tabular format is basically preserved),
they can be imported again with this tool.
"""

import argparse, sys, json, csv
import pandas as pd

parser = argparse.ArgumentParser(description="Export Inventory JSON to some tabular format")
parser.add_argument("--format", choices=["xls", "csv"], default="csv", help="Possible output formats")
parser.add_argument("--fields", nargs="*", help="Write only specific fields (columns). Run with --show-fields to see which are present/detected")
parser.add_argument("--show-fields", action='store_true', help="Don't write something, show only fields on stderr.")
parser.add_argument("infile", nargs="?", default="-", help="JSON file to canonicalize (default: read from stdin)")
parser.add_argument("outfile", nargs="?", default="-", help="File to generate (default: stdout). Note that Excel cannot be written to stdout")
args = parser.parse_args()

i, o = args.infile == "-", args.outfile == "-"

with (open(args.infile, "r") if not i else sys.stdin) as ifh:
    #data = json.read(ifh) # useful for REPL usage
    df = pd.read_json(ifh)

def show_fields():    
    print("The following fields are available (Hint: We use UTF-8):", file=sys.stderr)
    for c in df.columns:
        print(f'"{c}"', file=sys.stderr)

if args.show_fields:
    show_fields()
    sys.exit(0)

if args.fields:
    has_errors = False
    for f in args.fields:
        if not f in df.columns:
            print(f"Requested field '{f}' not a valid column name.")
    if has_errors:
        show_fields()
        sys.exit(-1)
    df = df[ args.fields ]

ofh = (open(args.outfile, "w") if not o else sys.stdout)

if args.format == "csv":
    df.to_csv(ofh, index=False)
if args.format == "xls":
    with pd.ExcelWriter(args.outfile) as writer:
        df.to_excel(writer)
