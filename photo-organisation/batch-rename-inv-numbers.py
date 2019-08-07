#!/usr/bin/env python2
#
# Use case: You have thousands of images in a directory, have already
#   attached labels such as (123) or "123 P1238.jpg" or
#   "(123) (345) P12348.JPEG" to your images and now want to rename
#   them chronologically so that all intermediate images have the right
#   name.

import PIL.Image, PIL.ExifTags

# python builtins:
import re, os
from datetime import datetime
from glob import glob

unzip = lambda lst: zip(*lst)

def get_inv_numbers(fname):
	# Important: We never treat inventory numbers as ints.
	#   They are always treated as strings.  This is to
	#   prevent malformatting 003 or similar.
	numbers = []
	
	# examples: "123 P12341.jpg"
	# or the breakup "xxx P213412.jpg" to indicate the end
	# of a series.
	m = re.match(r"^(\d+|xxx+)\s+", fname)
	if m:
		numbers.append(m.group(1))

	# examples: "(123) (415) P12348 (231).jpg"
	for m in re.finditer(r"[\(\[](\d+)[\)\]]", fname):
		numbers.append(m.group(1))
	
	return numbers

def put_inv_number(fname, number):
	return "(%s) %s" % (number, fname)

def sanatize_inv_number(fname, number):
	# will also change "123   ..." to "(123) ..."
	fname = re.sub(r"^(?:(?:\d+|xxx+)\s+)(.+)$", r'(%s) \1' % number, fname)
	fname = re.sub(r"\s+", " ", fname) # try to get rid of multiple spaces
	return fname

def normalize_filename(fname):
	return re.sub(r"\.jpe?g$", ".jpg", fname, flags=re.IGNORECASE)

def enrich_filename(fname, date):
	# Don't know yet if I like that.
	return re.sub(r"\.jpg$", ", %s.jpg" % date.isoformat(), fname)

sort_by = lambda lst, key_lst: [x for _,x in sorted(zip(key_lst,lst))]

def get_exif(fname):
	# https://stackoverflow.com/a/4765242/1656042
	with PIL.Image.open(fname) as img:
		return {
			PIL.ExifTags.TAGS[k]: v
			for k, v in img._getexif().items()
			if k in PIL.ExifTags.TAGS
		}

# parsing to datetime is not even really neccessary
# for being able to sort by datetime
get_exif_date = lambda fname: datetime.strptime(get_exif(fname)["DateTimeOriginal"], "%Y:%m:%d %H:%M:%S")

#files = glob("*.JPG")
files = glob("*.jpg")

if not "dates" in globals(): # for repetitive interactive use
	print "Reading EXIF dates from %d files..." % len(files)
	dates = map(get_exif_date, files)

# Key operation: Sort files by EXIF date (the most robust date information)
files = sort_by(files, dates)

invs = map(get_inv_numbers,files)

# statefully compute new filenames
new_files = [None]*len(files)
cur_inv = None

for i, (fn,inv) in enumerate(zip(files, invs)):
	if len(inv)==1: # leader
		cur_inv = inv[0]
		new_files[i] = sanatize_inv_number(fn, inv[0])
	
	elif len(inv)==0: # requires renaming
		assert cur_inv is not None
		new_files[i] = put_inv_number(fn, cur_inv)
	else:
		# cases where len(inv)1 are considered as fine,
		# except for normalization
		new_files[i] = fn

new_files = map(normalize_filename, new_files)

print "List of changes I would make:"
for old, new in zip(files, new_files):
	if old != new:
		print "'%30s' <- '%30s'" % (new,old)
		# uncomment if you want to do them
		#os.rename(old, new)



