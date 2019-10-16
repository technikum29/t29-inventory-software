#!/usr/bin/env python3
#
# This is a small standalone Python2 webserver.
# It servers as a REST/Websocket PubSub and logging server
# and allows serveral input devices for Inventory marking to work together
#
# Prototype, based on the inventory clapperboard webserver
#
#  Dependencies:  Tornado, Json-Patch, Pygit2
#
#  Install on Ubuntu as:
#
#    sudo apt install python3-tornado python3-jsonpatch
#    sudo pip3 install pygit2
#
# Update: We no more use jsonpatch on the serverside, while we don't have
# websockets any more.
#
# Quickly written by SvenK at 2019-04-26, 2019-05-10, Public Domain

#builtins
import os, sys, csv, io, re, platform, datetime, random, string, subprocess, hashlib, time, errno, inspect, shutil
from collections import defaultdict, OrderedDict
from itertools import islice
from os.path import join

# libraries/dependencies
import tornado.ioloop, tornado.web, tornado.websocket
from tornado.escape import json_decode, json_encode
from tornado.web import HTTPError
import json
import jsonpatch # pip3 install jsonpatch or so
import pygit2 # apt install python3-pygit2
#import sh # apt install python-sh

if not hasattr(pygit2.Repository, "add_worktree"):
	raise ImportError("pygit2 version is too old. Please reinstall with pip3.")

timestr = lambda: datetime.datetime.now().replace(microsecond=0).isoformat()

def make_handler(callback):
	class MiniHandler(tornado.web.RequestHandler):
		def set_default_headers(self):
			self.set_header('Content-Type', 'application/json')
			self.set_header("Access-Control-Allow-Origin", "*")  # todo, restrict this to same domain (from config)
			self.set_header("Access-Control-Allow-Headers", "x-requested-with")
			self.set_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
		def get(self): return callback(self)
		def post(self): return callback(self)
	return MiniHandler

write_encoded = lambda fun: lambda req: req.write(json_encode(fun(req)))

webserver_routes = []
def register(path):
	def decorator(fun_or_cls):
		webserver_routes.append( (path, make_handler(write_encoded(fun_or_cls)) if not inspect.isclass(fun_or_cls) else fun_or_cls ))
		return fun_or_cls
	return decorator

class Box(dict):
	"Mini-and-less-performant variant of https://news.ycombinator.com/item?id=14273863"
	def __getattr__(self, key):
		return Box(self[key]) if isinstance(self[key],dict) else self[key]

flatten = lambda x: [inner for outer in x for inner in outer ] # simple flatten 2d
randomString = lambda stringLength=10: ''.join(random.choice(string.ascii_lowercase) for i in range(stringLength))
make_default_identifier = lambda ip_as_str: ip_as_str + randomString(3)
author_legal = lambda author: bool(re.match('^[a-zA-Z0-9][a-zA-Z0-9-_.\s]+$', author))

# Do locking with semaphores; https://www.tornadoweb.org/en/stable/locks.html
# Assuming only a single process runs

def read_json_file(filename):
	# probably todo: file locking
	with open(filename, "r") as fh:
		return json.load(fh) # may raise ValueError if no valid JSON in file

def write_json_file(filename, data):
	# todo: file locking
	# Such as https://github.com/dmfrey/FileLock/blob/master/filelock/filelock.py#L15
	# or https://docs.python.org/2/library/fcntl.html#fcntl.lockf
	with open(filename, "w") as fh:
		fh.write(json.dumps(data, indent=4, sort_keys=True))

static_file_path = os.path.dirname(__file__)
config = Box(read_json_file("./inventory-editor-config.json"))

#message_file = "markers-%s.csv" % timestr()

#   a {media repository} holds several {media collections} which are directories holding photos.

master = pygit2.Repository(config.paths.inventory_repository)

repo_file = lambda fname: join(config.paths.inventory_repository, fname)
workdir_path = lambda author: join(config.paths.patches_directory, author)
workdir_file = lambda author, fname: join(config.paths.patches_directory, author, fname)
signature = lambda author: pygit2.Signature(author, author+"@t29-inventory-server")
extgit = lambda *cmds: subprocess.call(["git"]+list(cmds), cwd=config.paths.inventory_repository)

@register(config.server.git_log_path)
def git_log(req):
	"""Provides a small machine readable git log"""
	max_items = 10
	return [ {
		"author": commit.committer.name,
		"date": datetime.datetime.utcfromtimestamp(commit.commit_time).isoformat(),
		"id": commit.id.hex,
		"message": commit.message
	    } for commit in islice(master.walk(master.head.target, pygit2.GIT_SORT_TOPOLOGICAL), max_items)
	]

@register(config.server.git_commit_path)
def git_commit(req_handler):
	"Recieve commit, branch off, commit, merge back to master."
	### Security methods to impelemt:
	###    (a)  Size of files limit
	###    (b)  commit only once per second
	
	req = req_handler.request	
	if(req.method != "POST"): raise HTTPError(400, "Expecting POST method with JSON payload")
	try:
		commit = tornado.escape.json_decode(req.body)
		author = commit["working_copy"]["author"]
		message = commit["working_copy"]["commit_msg"]
		base_commit_id = commit["working_copy"]["base_commit"]["id"]
		files = { k: commit["files"][k] for k in config.files.keys() if k in commit["files"] }
	except ValueError:
		raise HTTPError(400, "Invalid JSON input")
	
	if not author or not author_legal(author):
		raise HTTPError(400, "Please specify a valid author (%s given)" % author)
	if not base_commit_id or not re.match(r"[a-z0-9]{4,40}", base_commit_id): # need to be hex
		raise HTTPError(400, "Malformed base commit id, it's not a git sha1 ref.")
	if os.path.exists(workdir_path(author)):
		raise HTTPError(400, "Author '%s' worktree exists, please try again later" % author)
	wt = master.add_worktree(author, workdir_path(author)) # will also create branch called <author>
	# wt = master.lookup_worktree(author)
	work = pygit2.Repository(wt.path)

	# basically do git checkout <base_commit_id> a la libgit2
	oid = pygit2.Oid(hex=base_commit_id)
	try: work.set_head(oid)
	except KeyError: raise HTTPError(400, "Nonexisting base commit given")
	work.checkout_index()
	# now work is in detached state if oid is not HEAD.
	
	for filekey, filename in config.files.items():
		if not filekey in files: continue
		write_json_file(workdir_file(author, filename), files[filekey])

	## the cumbersome "git add" from pygit2
	# treeBuilder = workrepo.TreeBuilder()
	# for fn in repo_files.values():
	#	blob = workrepo.create_blob_fromworkdir(fn)
	#	treeBuilder.insert(fn, blob, os.stat(workdir_file(author, fn)).st_mode)
	# tree = treeBuilder.write()
	
	# Alternatively by maintaining the index
	work.index.read()
	#map(work.index.add, config.files.values())
	work.index.add_all()
	work.index.write()
	tree = work.index.write_tree()
	
	# the actual commit
	sign = signature(author)
	message += "\n\nCommitted-via: t29-inventory-webserver"
	work_commit = work.create_commit("HEAD", sign, sign, message, tree, [work.head.target])
	
	# for whatever reason, since I'm detached now, have to move manually...
	work_branch = master.lookup_branch(author)
	work_branch.set_target(work_commit)
	
	## This basically works, but leaves master in a state which says 
	##   "All conflicts fixed but you are still merging."
	if False:
		# after every edit, merge work to the master.
		master.merge(work.head.target)
		# do not use the created index but do our own one, with a "theirs" merge strategy
		# Doesn't work, however. Unfortunately.
		#index = master.merge_commits(master.head.target, work.head.target, favor="theirs")
		#tree = index.write_tree()
		tree = master.index.write_tree()
		master_commit = master.create_commit("HEAD", sign, sign, "Merging\n"+message, tree, [master.head.target, work.head.target])
	
	# Fall back to good old shell in order to sync the branches
	ret = extgit("merge", "--no-edit", "-q", author, "-X", "theirs", "-m", "Merging by overwriting from branch %s."%author)
	if ret:
		raise HTTPError(400, "Could not merge git branch %s to master (status %d)" % (author, ret))
	# okay, whyever now the merge leaves us in an ugly state...
	extgit("rebase", "HEAD", "master")

	# TODO: Instead of dumb overwriting, should implement the following strategy:
	#   1. Try to do a git merge, check if result is readable JSON. If so, nice.
	#   2. If not, fallback to git merge -X theirs.
	
	# Cleanup
	shutil.rmtree(workdir_path(author))
	wt.prune(True) # force=True neccessary to delete it
	work_branch.delete()

	print("Committed from user %s" % author)
	return { "Result": "Success" } # not really processed anyway


app = tornado.web.Application(webserver_routes + [
    ('/', make_handler(lambda req: req.redirect("app/"))),
    (r'/(.*)', tornado.web.StaticFileHandler, {
         'path': static_file_path,
	 "default_filename": "index.html"
    })
], debug=True)

print("Starting Tornado server on port %d" % config.server.port)
app.listen(config.server.port)
tornado.ioloop.IOLoop.current().start()







