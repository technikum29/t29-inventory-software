#!/usr/bin/env python
#
# Read of the inventory assignments from the image filenames.
# Reason for introducing this duplication is the easy authoring of json files
# in contrast to filenames, and its easy version controlling. Furthermore,
# no changes in filenames are neccessary. The filenaming is then kind of obsolete.
#
# Usage: ./generate-json-assignment.py  > ../test-inventory/media.json
#
# Sven, 2019-05-19

import re, os, collections
import json

def read_json_file(filename):
	# probably todo: file locking
	with open(filename, "r") as fh:
		return json.load(fh) # may raise ValueError if no valid JSON in file
flatten = lambda x: [inner for outer in x for inner in outer ] # simple flatten 2d
sort_using = lambda lst, element_map: [x for _,x in sorted(zip(map(element_map, lst),lst))]
lastmod = lambda fn: os.stat(fn).st_mtime

paths = { "media_repository": "./", "media_config_file": "media_config.json" }

# The naming scheme here is:
#   a {media repository} holds several {media collections} which are directories holding photos.
media_config = read_json_file(os.path.join(paths["media_repository"], paths["media_config_file"]))

all_files = flatten([
	[os.path.join(dp, f) for dp, dn, filenames in os.walk(os.path.join(paths["media_repository"], media_collection)) for f in filenames ]
	for media_collection in media_config["media_collections"]
])
	
# Give the list of figures relative to media_repository.
media_list = [ os.path.relpath(fn, paths["media_repository"]) for fn in all_files ]

def all_inventory_in(filename):
	# as always, we keep inventory numbers as stringss
	return [ m.group(1) for m in re.finditer(r"\((\d{3,})\)", filename) ]

# This would map filename to list of inventory
media_dict = { fn: all_inventory_in(fn) for fn in media_list }
media_dict = { k:v for k,v in media_dict.iteritems() if v } # remove empty

# Instead, we also can map each inventory to its filenames
media_dict2 = collections.defaultdict(list)
for fn in media_list:
	for inv in all_inventory_in(fn):
		media_dict2[inv].append(fn)

# sort all lists, providing the default ordering
media_dict2 = { k: sort_using(v, lastmod) for k,v in media_dict2.iteritems() }


print json.dumps(media_dict2, indent=4, sort_keys=True)
