#!/usr/bin/env python2
#
# This is a small standalone Python2 webserver.
# It servers as a REST/Websocket PubSub and logging server
# and allows serveral input devices for Inventory marking to work together
#
# Prototype, based on the inventory clapperboard webserver
#
#  Dependencies:  Tornado, Json-Patch
#
# Quickly written by SvenK at 2019-04-26, 2019-05-10

#builtins
import os, sys, csv, io, re, platform, datetime, random, string, subprocess, hashlib
from collections import defaultdict

# libraries/dependencies
import tornado.ioloop, tornado.web, tornado.websocket
from tornado.escape import json_decode, json_encode
from tornado.web import HTTPError
from json import load as json_load # from file
import jsonpatch # PyPi https://python-json-patch.readthedocs.io/en/latest/
import pygit2 # apt install python-pygit2
#import sh # apt install python-sh

timestr = lambda: datetime.datetime.now().replace(microsecond=0).isoformat()

def make_handler(callback):
	class MiniHandler(tornado.web.RequestHandler):
		def get(self):
			return callback(self)
	return MiniHandler

class memoize:
    def __init__(self, f):
        self.f = f
        self.memo = {}
    def __call__(self, *args):
        if not args in self.memo:
            self.memo[args] = self.f(*args)
        return self.memo[args]

flatten = lambda x: [inner for outer in x for inner in outer ] # simple flatten 2d
randomString = lambda stringLength=10: ''.join(random.choice(string.ascii_lowercase) for i in range(stringLength))
make_default_identifier = lambda ip_as_str: ip_as_str + randomString(3)
author_legal = lambda author: bool(re.match('^[a-zA-Z0-9][a-zA-Z0-9-_.\s]+$', author))

def read_json_file(filename):
	# probably todo: file locking
	with open(filename, "r") as fh:
		return json_load(fh) # may raise ValueError if no valid JSON in file
def write_json_file(filename, data):
	# todo: file locking
	# Such as https://github.com/dmfrey/FileLock/blob/master/filelock/filelock.py#L15
	# or https://docs.python.org/2/library/fcntl.html#fcntl.lockf
	with open(filename, "w") as fh:
		fh.write(json_encode(data))


port = 8000
static_file_path = os.path.dirname(__file__)
#message_file = "markers-%s.csv" % timestr()

paths = {
	# files in the local directory
	"inventory_repository": "../../test-inventory/",
	"patches_directory": "./patches/",
	"media_repository": "../../t29-inventory-assets/",
	
	# relative to media_directory or media_path, respectively,
	# containing more paths and information
	"media_config_file": "media_config.json",
	
	# A "virtual" URL endpoint, no files
	"websocket_path": "/lazy-websocket-editor",
	"inventory_path": "/inventory/inventory.json", # mind the missing dot; absolute
	"media_path":     "/t29-inventory-assets/"
}

repo_files = {
	"inventory": "inventory.json",
	"schema": "schema.json",
	"media": "media.json"
}

#   a {media repository} holds several {media collections} which are directories holding photos.
media_config = read_json_file(os.path.join(paths["media_repository"], paths["media_config_file"]))
# "Mount" media config into paths for simplicity and sharing with client
paths["media_config"] = media_config

master = pygit2.Repository(paths["inventory_repository"])

repo_file = lambda fname: os.path.join(paths["inventory_repository"], fname)
workdir_path = lambda author: os.path.join(paths["patches_directory"], author)
workdir_file = lambda author, fname: os.path.join(paths["patches_directory"], author, fname)
signature = lambda author: pygit2.Signature(author, author+"@t29-inventory-server")
extgit = lambda *cmds: subprocess.call(["git"]+list(cmds), cwd=paths["inventory_repository"])

def repo_head(repo_path=None):
	if not repo_path: repo_path = paths["inventory_repository"]
	repo_obj = pygit2.Repository(repo_path) # just to be independent
	commit = repo_obj[repo_obj.head.target]
	return {
		"author": commit.author.name,
		"date": datetime.datetime.utcfromtimestamp(commit.commit_time).isoformat(),
		"id": commit.id.hex,
		"message": commit.message
	}


def media_list():
	# Deprecated: I now stick to a repo-managed list which makes changing assignments
	# trivial and evventually allows for tracking who provided which files.
	
	"""
	Return a list of media which might be used for renaming by the client.
	Note: the list of filenames is unsorted and may contain anything (not only photos or media)
	"""
	all_files = flatten([
		[os.path.join(dp, f) for dp, dn, filenames in os.walk(os.path.join(paths["media_repository"], media_collection)) for f in filenames ]
		for media_collection in media_config["media_collections"]
	])
		
	# Give the list of figures relative to media_repository.
	return [ os.path.relpath(fn, paths["media_repository"]) for fn in all_files ]

def provide_state(repo_path=None):
	"Read repository and provide data to work with"
	if not repo_path: repo_path = paths["inventory_repository"]
	return {
		"head_commit": repo_head(),
		"files": { k: read_json_file(repo_file(v)) for k,v in repo_files.iteritems() },
	}

def rename(old_author, new_author):
	"Rename his stuff and thelike"
	if not author_legal(new_author):
		raise HTTPError(400, "New Author name is illegal")
	if not extgit("branch", "-m", old_author, new_author):
		raise HTTPError("Could not rename author branch")
	if not extgit("worktree", "move", old_author, worktree_path(new_author)):
		raise HTTPError("Could not move worktreee")	

def write(author, new_files={}):
	"Write to repository"
	if not author or not author_legal(author):
		raise HTTPError(400, "Please specify a valid author (%s given)" % author)
	if not os.path.exists(workdir_path(author)):
		master.add_worktree(author, workdir_path(author))
	for k,v in repo_files.iteritems():
		if k in new_files:
			write_json_file(workdir_file(author, v), new_files[k])	

def commit(author, message=""):
	"Make a commit based on the changes"
	# assumes stash_commit / changes have been made
	
	if not author or not author_legal(author):
		raise HTTPError(400, "Please specify a valid author (%s given)" % author)
	if not os.path.exists(workdir_path(author)):
		raise HTTPError(400, "Author '%s' has never made any changes" % author)
	
	wt = master.lookup_worktree(author)
	work = pygit2.Repository(wt.path)
	
	## the cumbersome "git add" from pygit2
	# treeBuilder = workrepo.TreeBuilder()
	# for fn in repo_files.values():
	#	blob = workrepo.create_blob_fromworkdir(fn)
	#	treeBuilder.insert(fn, blob, os.stat(workdir_file(author, fn)).st_mode)
	# tree = treeBuilder.write()
	
	# Alternatively by maintaining the index
	work.index.read()
	map(work.index.add, repo_files.values())
	work.index.write()
	tree = work.index.write_tree()
	
	# the actual commit
	sign = signature(author)
	message += "\n\nCommitted-via: t29-inventory-webserver"
	work_commit = work.create_commit("HEAD", sign, sign, message, tree, [work.head.target])
	
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
	ret = extgit("merge", "-q", author, "-X", "theirs")
	if ret:
		raise HTTPError("Could not merge git branch %s to master (status %d)" % (author, ret))

	print "Committed"
	return { "Result": "Success" } # not really processed anywhere

class register_author(tornado.web.RequestHandler):
		def get(self, author=None):
			if not author or author_legal(author):
				author = make_default_identifier(self.request.remote_ip)
			self.set_cookie("inv_author", author)
			self.write(json_encode({ "accepted_author": author }))

class State:
	@classmethod
	def provide(cls,author):
		# fabric usage
		if not hasattr(cls, "states"): cls.states={}
		if not author in cls.states:
			cls.states[author] = cls(author)
		return cls.states[author]
	
	def __init__(self, author):
		self.author=author
		# TODO: Lazily create copy of files only if neccessary.
		#       At this point only remember commit.
		write(author=self.author) # setup a copy of the files
		self.state = provide_state(workdir_path(self.author))
		self.state["author"] = self.author
		self.state["commit_msg"] = "" # provide an empty slot

	def recv(self, patches):
		# TODO: Should implement a poor mans operational transformations, i.e. send
		#       the patch to all clients with the same author name.
		# so we assume the thing we got is a JSON patch document on the state
		jsonpatch.apply_patch(self.state, patches, in_place=True)
		
		# Detect author changes
		if any([patch["path"] == "/author" for patch in patches]):
			rename(self.author, self.state["author"])
			self.author = self.state["author"]
			
		# Detect media changes
		if any([patch["path"] == "/media" for patch in patches]):
			print "TODO: Media renaming!"
		
		# At one point, be lazy. Only during development write out frequently.
		print "Writing out changed files..."
		write(self.author, self.state["files"])

class LazyWebsocketEditor(tornado.websocket.WebSocketHandler):
    """
    Also allows several connections simultaneously from the same user,
    i.e. for several browser windows open
    """
	
    def open(self):
	#import pdb; pdb.set_trace()
	print "Websocket client %s connected" % self.request.remote_ip
        self.set_nodelay(True)

        if not self.get_cookie("inv_author"):
		raise HTTPError(400, "Expect author name as cookie. Request with /register_author or so")
	author = self.get_cookie("inv_author")
	if not author_legal(author):
		raise HTTPError(400, "Bad author")

        #self.author = make_default_identifier(self.request.remote_ip)

	self.state = State.provide(author)

        # send the initial information to the client
        # self.write_message(self.state.state) # -> nope, he can get that with GET /state

    def check_origin(self, origin): return True # allow all

    def on_message(self, message):
	patches = json_decode(message)
	self.state.recv(patches)

    def on_close(self):
        print "Websocket client %s disconnected" % self.request.remote_ip
        #self.state.commit(patches)
        #commit(self.author, "Commit on disconnect")


app = tornado.web.Application([
    (paths["websocket_path"], LazyWebsocketEditor),
    ('/paths', make_handler(lambda req: req.write(json_encode(paths)))),
    ('/files', make_handler(lambda req: req.write(json_encode({k:repo_file(v) for k,v in repo_files.iteritems()})))),
    ('/author', register_author),
    ('/state', make_handler(lambda req: req.write(State.provide(req.get_cookie("inv_author")).state))),
    ('/commit', make_handler(lambda req: req.write(commit(req.get_cookie("inv_author"), req.get_argument("message"))))),

    ('/', make_handler(lambda req: req.redirect("app/"))),
    (r'/(.*)', tornado.web.StaticFileHandler, {
         'path': static_file_path,
	 "default_filename": "index.html"
    })
], debug=True)

print "Starting Tornado server on port %d" % port
app.listen(port)
tornado.ioloop.IOLoop.current().start()
