/**
 * t29 inventory editor "mobile editor".
 * This is a client-first pure JS application written in the 
 * progressive web app spirit, i.e. perfectly capable to be run offline,
 * given an initial amount of data which is downloaded from a server side.
 * 
 * The main idea of the overall editor/viewer is that there is a single state
 * which is shared between client/server and ultimately represents the database
 * or attached media files.
 * 
 * As a design decision, a "NoSQL document database" is chosen, i.e. this is
 * just an editor for a JSON document which is hold in memory. This is possible
 * because the inventory database is quite small (a few thousand records)
 * 
 * SvenK, 2019-04, Public Domain
 **/


/* The global "app" object is the global State managed by Vue.
 * However, only "state" is observed by jsonpatch and synced
 * between server and client. All other objects are client-local.
 */
var app = {
	/// files: Synced with the server, holding the individual files as objects;
	///        in their current state (with all changes)
	files: {},
	
	/// working_copy: Git information about the base commit loaded
	working_copy: {},
		
	/// Message structs are of type {type:"warning",header:"Didnt work","body":"Explanation"}
	/// and will be shown at top
	messages: [],
	
	// Defining the state of the viewer application
	loaded: false,
	connection: "loading...",
	view_state: undefined,
	
	patch_size: 0, // default, no changes made (yet)
	view_settings: {
		// Current/default view state/Preferences in display types
		inventory_list: {
			hide_without_images: true,
			tabular: false,
			cols: [ "Inv-Nr.", "Objekt", "Beschreibung", "Ort" ]
		},
		inventory_detail: {
			show_image_reordering: false
		},
	},
	global_view_settings: {
		show_welcome_infobox: true, // popup on first visit
		show_editing_infobox: false,
		search_box_content: ''
	},

	// how frequently to compute json patch updates
	debouncing_time_ms: 200,
	// a prefix for generated URLS, such as "/app" or so, used in routing (without "http://...")
	url_prefix: "/inventory-editor/",
	// the id key field name
	id_field: "Inv-Nr.",  // or: "Inventar-Nr."
	
	// The path to the bootstrapping configuration
	configuration_path: "/inventory-editor-config.json"
};

// returns reject Promise for convenience, as usually used in that context
show_message = (type, header, body) => { app.messages.push({type,header,body}); return Promise.reject("Failure: "+body) }

// possible caveats: Since I am abusing app also as storage for
//   functions/classes, this could slow down vue.

url_for = absolute => window.location.protocol + "//" + window.location.host + app.url_prefix + absolute 


function setup_ui_dropdown(el) {
	$(el).find('.ui.dropdown').dropdown({
		allowAdditions: true,
		onBlur: function() { that.editing = false;  }
	});
}

// Returns a function, that, as long as it continues to be invoked, will not
// be triggered. The function will be called after it stops being called for
// N milliseconds. If `immediate` is passed, trigger the function on the
// leading edge, instead of the trailing.
function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

function baseName(str) {
	var base = new String(str).substring(str.lastIndexOf('/') + 1); 
	if(base.lastIndexOf(".") != -1)       
		base = base.substring(0, base.lastIndexOf("."));
	return base;
};

// Like pythons os.path.join
function pathJoin(parts, sep){
   var separator = sep || '/';
   var replace   = new RegExp(separator+'{1,}', 'g');
   return parts.join(separator).replace(replace, separator);
}

// natural sorting (like ["1", "2", "10"])
var natsort_collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
naturalsort = lst => lst.sort(natsort_collator.compare)

// Filter objects like arrays
filterObj = (obj, check) => Object.keys(obj).reduce((r,e) => { if(check(e,obj[e])) r[e] = obj[e]; return r }, {})
// Escape stuff for regexpes
escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
// Filter out undedined/Nones/False or empty values
withoutNones = lst => lst.filter(e=>e)
// Unique elements in list (ES6
unique = lst => naturalsort([...new Set(lst)])
// Get all unique values for a certain field
uniqueFieldValues = (obj, key) => unique($.map(obj, el => el[key]))
// Get all values from a certain field
fieldValues = (obj, key) => withoutNones($.map(obj, el => el[key]))
// the safest method
deepCopy = obj => JSON.parse(JSON.stringify(obj));

var setup_patch_observer = function() {
	// should be called whenever app.files is replaced or one wants to track changes from scratch
	
	app.base_files = deepCopy(app.files)
	app.base_patch = () => jsonpatch.compare(app.base_files, app.files) // maybe interesting for commit review
	
	// Setup jsonpatch observation of inventory object.
	// Could also define a callback here.
	var patch_observer = jsonpatch.observe(app.files);
}

var setup_uplink = function() {
	// setup synchronization routines
	var fqdn_ws_path = "ws://" + window.location.host + app.config.paths.websocket_path;
	app.websocket = new WebSocket(fqdn_ws_path); // allow the state to be displayed by vue
	
	var msg_counter = 0;
	app.websocket.onmessage = evt => {
		//msg = JSON.parse(evt.data)
		// Initial message is the initial state
		//if(msg_counter++ == 0) app.state = msg
		console.log("Recieved ", msg)
	}
	
	app.websocket.onopen = evt => app.connection = "connected"
	app.websocket.onclose = evt => app.connection = "closed"
	
	
	app.send = function() {
		// JSONPatch will show all *pending* changes, i.e. not relative to root document
		var patch = jsonpatch.generate(patch_observer)
		app.patch_size += patch.length;
		app.websocket.send(JSON.stringify(patch));
	};
	
	app.commit = function() {
		$.getJSON("/commit", { "message": app.commit_msg  },
			  res => console.log(res)
		)
		// maybe reloading the page is a good idea now.
	}
};

app.human_readable_patch = function() {
	return app.base_patch().map(patch => {
		var parts = withoutNones(patch.path.split("/"))
		var ret = {
			part: parts[0],
			op: patch.op,
			op_verb: { 'add':'adding', 'replace':'replacing', 'remove':'removing'}[patch.op],
			value: patch.value,
		}
		var inv = (ret.part == "inventory" || ret.part == "media") ?
			  app.base_files.inventory[ parseInt(parts[1]) ] : null;
		ret[app.id_field] = inv ? inv[app.id_field] : null
		ret.path = parts[2]
		return ret
	})
}

var setup_vue = function() {
	// First, register a couple of global Vue components
	
	// Hey, the global mixin. To support the crappy strategy of a global object without vuex
	Vue.mixin({
		data: function() { return { app: app }; },
		
		// effectively applies to app.views components only, since they are addressed
		// by the router
		beforeRouteUpdate: function(to, from, next) {
			const toDepth = to.path.split('/').length
			const fromDepth = from.path.split('/').length
			this.app.routing_transition_name = toDepth < fromDepth ? 'slide-right' : 'slide-left'
			next()
		},

		methods: {
			sorted: naturalsort,
			//orderBy: 
		}
	});
	// Alternatively and similarly dirty for reactive data: Vue.prototype.$foo = 'bar', access as {{foo}}
	
	app.views = [
		{ path: "/", redirect: "/inv" },
		{
			path: '/inv', // aka "the frontpage"
			name: "list_all",
			component: Vue.component("InventoryList", {
				template: '#inventory-list',
				data: function() {
					return { // shortcuts to reactive elements:
						inventory: app.files.inventory,
						view: app.view_settings.inventory_list
					}
				},
				computed: {
					url_for_teaser: function() {
						return this.inventory.map(inv => teaser_url_for_id(inv[app.id_field]))
					},
					placeholder: () =>
						pathJoin([
							app.url_prefix,
							app.config.paths.media_repository,
							app.config.media.square_thumbnail_placeholder
						])
				}
			})
		},
		{
			path: '/inv/:id',
			props: inventory_by_id,
			name: "detail",
			component:  Vue.component("InventoryDetail", {
				template: '#inventory-detail',
				props: ["inv"],         // the inventory record looked at
				data: function() {
					return {
						schema: app.files.schema,
						view: app.view_settings.inventory_detail
					} // shorthand
				},
				computed: {
					thumbnails: function() { return thumbnail_urls_for_id(this.inv[app.id_field]) },
					media: function() { return media_urls_for_id(this.inv[app.id_field]) },
				},
				mounted: function() {
					// Nice dimming effect of Semantic-UI. Not important, thought.
					// $('.cards .image').dimmer({ on: 'hover' });
				},
				methods: {
					sort_media: function(current_idx, offset) {
						var media = app.files.media[this.inv[app.id_field]];
						var new_idx = current_idx + offset;
						
						if(new_idx<0) new_idx = media.length-1; // rotate
						if(new_idx>=media.length) new_idx=0;

						var intermediate_media_new_idx = media[new_idx]; 
						Vue.set(this.app.files.media[this.inv[app.id_field]], new_idx, media[current_idx])
						Vue.set(this.app.files.media[this.inv[app.id_field]], current_idx, intermediate_media_new_idx)
					},
			     
					remove_media: function(idx) {
						this.app.files.media[this.inv[app.id_field]].splice(idx, 1)
					},
				}
			})
		},
		{
			path: "/commit",
			name: "commit",
			component: Vue.component("CommitView", {
				template: "#commit-view",
				data: function() {
					return { files: app.files } // To be fixed (was state: app.state)
				},
				methods: {
					submit: ()=>{
						if(app.commit) app.commit()
						else {
							show_message("warning", "Cannot connect to git database",
							"Please download your database changes instead and mail it to the administration.")
						}
					},
					download: ()=>{
						alert("Todo: Find single JSON which to send to server; also download it instead. (Git JSON exchange format)")
					},
					patch: app.human_readable_patch
				},
			})
		},
		{
			// This is currently a schema editor for all fields. Want to go one field a time.
			path: "/schema",
			name: "schema",
			component: Vue.component("SchemaEditor", {
				template: "#schema-editor",
				data: function() {
					return { schema: app.files.schema }
				},
				computed: {
					uniqueEditors: function() { return uniqueFieldValues(this.schema.properties, "editor"); }
				},
				methods: {
					uniqueSchemaFieldValues: // doesnt quite work, using computed instead
						field => uniqueFieldValues(app.files.schema.properties, field),
					uniqueFieldValues: 
						field => uniqueFieldValues(app.files.inventory, field),
					fieldValues:
						field => fieldValues(app.files.inventory, field),
					usage: field => {
						file = app.files.inventory
						return fieldValues(file, field).length / file.length
					}
				},
				mounted: function() {
					setup_ui_dropdown(this.$el)
				}
			})
		},
		{
			path: "/media",
			name: "media-list",
			component: Vue.component("MediaList", {
				template: "#media-list",
				data: function() {
					return {
						// Okay, we do not track unlisted media here or a list
						// of all media. Should obtain that from the server!
						media:
							{ "todo": ["123", "456"] }
					}
				}
			})
		},
		{
			path: "/export",
			name: "export",
			component: Vue.component("ExportView", {
				template: "#export-view",
				data: function() { return { file_links: Object.keys(config.files).reduce((obj, fn) => {
					obj[ config.files[fn] ] = {
						static: pathJoin([app.url_prefix, config.paths.inventory_repository, config.files[fn]]),
						localStorage: "data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(app.files[fn])),
					}
					return obj
				   }, {})
				}} // end of function and data
			})
		},
		{
			// 404 path
			path: '*',
			component: {
				template: '<b>404 nonexistent. <a href="#/">Go to start</a></b>'
			}
		}
	]; // end of app.views
	
	// This is a real "widget" component and not supposed to be adressable via routers.
	Vue.component("FieldDisplay", {
		template: "#field-display",
		data: function() {
			return { editing: false } // wether currently editing or not
		},
		props: {
			inv: { type: Object, required: true },         // The inventory record (object)
			field: { type: String, required: true },       // The name of the field to display (string)
			alwaysEditing: { type: Boolean, default: false }, // Always show form fields
			inputClass: { type: String, required: false }       // Some additional property for the form field
		},
		computed: {
			schema:
				function() { return app.files.schema.properties[this.field] || {
					/* default schema */
					editor: "single-line",
					is_default: true,
					type: "string"
				}; },

			// TBD: Move to $root.

			// computing this for every component is quite slow, especially if the page
			// has many of these componens.
			uniqueFieldValues:
				function() {
					var relevantInv = app.files.inventory;
					if(this.schema.editor_flags && this.schema.editor_flags.restrict_options_by) {
						// Filter to subset
						relevantInv = relevantInv.filter(inv =>
							inv[this.schema.editor_flags.restrict_options_by] == this.inv[this.schema.editor_flags.restrict_options_by])
					}
					return uniqueFieldValues(relevantInv, this.field);
				},

			wrapperClass: function() { /* class attributes for view-only part */
				return {
					//display: isEditing() ? 'none' : 
					//(this.schema.editor=="multiline"?"block":'inline')
					
					editing: this.isEditing(),
					viewing: !this.isEditing(),
					[this.schema.editor]: true // ES6 syntax
				}
			},

		       viewFiltered: function() {
				var raw = this.inv[this.field]
				if(this.schema.type == "markdown") {
					return markdown.makeHtml(raw)
				}
				return raw // TODO: html escape on myself here
		       }
		},
		methods: { // shorthands for usages in templates
			enableEdit: function() {
				this.editing = true;
				// neither one works. Don't know why.
				$(this.$el).find(".editor").first().focus()
				this.$el.getElementsByClassName("editor")[0].firstChild.focus()
			},
			stopEdit: function() { this.editing = false; },
			isEditing:  function() { return this.editing || this.alwaysEditing; }
		},
		mounted: function() {
			var that = this;
			
			// Semantic-UI allways allow additions to dropdowns
			setup_ui_dropdown(this.$el) // -> try differently instead
		}
	});
	
	var app_vue = new Vue({
		data: app, // Makes app reactive accross all routes
		
		router:  new VueRouter({
			routes: app.views,
			base: app.url_prefix
		}),
		
		watch: {
			state: { /* "state" property in the Vue data */ 
				handler: debounce(app.send, app.debouncing_time_ms),
				deep: true,
				//immediate: true // called immediately after start of observation
			},

			// call new state once set
			view_state: function(new_state) { states[new_state](); }
		},
		
		
		// Only used for global search/navigation
		methods: {
			link_detail: function(rel) {
				if(this.$route.name != "detail") return alert("Works only in inventory detail view");
				var relations = inventory_relationships_by_id(this.$route)
				this.$router.push({ name: "detail", params: { id: relations[rel] }})
			},
			link_prev: function() { this.link_detail("prev"); },
			link_next: function() { this.link_detail("next"); },
			reload: () => { persistentStorage.clear(); location.reload() }
		}
	}).$mount('#app');
	
	$("body").addClass("vue_works")
};

var inventory_relationships_by_id = function(route) {
	// This functio encapsulates the "inventory is a number" paradigm.
	// Alternatively, it could also search in app.files.inventory for the neighbouring inventories.
	var itemInt = parseInt(route.params.id);
	return { prev: (itemInt-1).toString(), next: (itemInt+1).toString() };
}

var inventory_by_id = function(route) {
	var item = app.files.inventory.find(e_inv => e_inv[app.id_field] == route.params.id);
	//console.log("Fand zu ID ",route.params.id," Datensatz ", item);
	return { inv: item,
		 inventory: app.files.inventory, // global just for navigation
	};
};

var thumbnail_urls_for_id = function(invnr) {
	// Expecting invnr to be a string, as usual.
	// Returns the subset of media witch are matching
	// numbermatcher = new RegExp(escapeRegExp("(") + invnr + escapeRegExp(")"))
	// return filterObj(app.state.media, (k,v)=> v.match(numbermatcher, "g") && !v.includes(".thumb.jpg"))
	return (app.files.media[invnr] || [/* empty list */])
		.map(p => pathJoin([app.url_prefix, app.config.paths.media_repository, app.config.media.cache_directory, p]))
}

var media_urls_for_id = function(invnr) {
	return (app.files.media[invnr] || [/* empty list */])
		.map(p => pathJoin([app.url_prefix, app.config.paths.media_repository, p]))
}

var teaser_url_for_id = function(invnr) {
	//var images = images_for_id(invnr)
	//var keys = Object.keys(images)
	//if(keys.length)
	//	return keys[0] // not the best one
	var imgs = thumbnail_urls_for_id(invnr);
	if(imgs.length)
		return imgs[0] + app.config.media.square_thumbnail_suffix
}

var persistentStorage = {
	// each field is a key in the app structure with is synced with localStorage
	fields: [
		"files", // data synced with server
		"config", "working_copy",   // read-only from server
		"view_settings", "global_view_settings",  // never shared with server
	],
	
	ns: v => `inv/${v}` // namespacing the domain-wide localStorage
};

persistentStorage.isNonEmpty =()=> window.localStorage && Boolean(localStorage.getItem(persistentStorage.ns(persistentStorage.fields[0])))
persistentStorage.store =()=> persistentStorage.fields.forEach(k => localStorage.setItem(persistentStorage.ns(k), JSON.stringify(app[k])))
persistentStorage.load =()=> { persistentStorage.fields.forEach(k => app[k] = JSON.parse(localStorage.getItem(persistentStorage.ns(k))));
	// basically reset the patch observer
	setup_patch_observer(); }
persistentStorage.clear =()=> persistentStorage.fields.forEach(k => localStorage.removeItem(persistentStorage.ns(k)))

/** Change the application state with app.view_state = "XXX" */
var states = {
	pulling(msg) {
		app.connection = msg ? msg : "pulling"
		
		// Todo: Load Head commit information into app.working_copy
		
		var load = src => fetch(url_for(src))
			.then(res => res.ok ? res : Promise.reject(`Request rejected with status ${res.status}`))
			.catch(()=>
				show_message("warning", "Could not download required ressource",
				`Ressource <a href="${url_for(src)}">${url_for(src)}</a> could not be accessed`))
			.then(res => res.json())
			.catch(()=>
				show_message("warning", "Malformed database ressource",
				`Ressource <a href="${url_for(src)}">${url_for(src)}</a>  is not valid JSON`))
	
		return load(app.configuration_path, "config").then(config => {
			app.config = config     // accessible to vue
			window.config = config  // globalize as shortcut
			
			// Download all relevant git-managed json files
			return Promise.all(
				Object.keys(config.files).map(key =>
					load(pathJoin([config.paths.inventory_repository, config.files[key]]))
					.then(data => Vue.set(app.files, key, data))
				)
			).then(()=> {
				persistentStorage.store();
				setup_patch_observer();
				/* setup_uplink(); */
				// states.viewing()
				app.view_state = "viewing"
			})
		}, /*failure*/()=>{
			show_message("warning", "Could not start application",
				"Could not load base configuration from " + url_for(app.configuration_path))
		})
	},
	
	cloning() {
		app.loaded = false
		states.pulling("Downloading/cloning...").then(()=> app.loaded = true)
	},
	
	viewing() {
		app.loaded = true
		app.connection = "Viewing"
	},
	
	editing() {
		// once some changes have been made
		// going back to viewing after commit.
		app.connection = "Editing"
	}
}

app.main = function() {
	setup_vue()
	if(persistentStorage.isNonEmpty()) {
		persistentStorage.load()
		app.view_state = "pulling" // trigger a pull
	} else {
		app.view_state = "cloning"
	}
	
	/* setup global hamburger menu (half bit SemanticUI related) */
	$('.hamburger').click(function(e){
		$menu = $(this).parent();
		if(!$(this).hasClass('active')) {
			$(this).addClass('active');
			$menu.addClass('open');
		} else {
			$(this).removeClass('active');
			$menu.removeClass('open');
		}
		e.preventDefault();
	});
};

var markdown = new showdown.Converter({
	simplifiedAutoLink: true,
	literalMidWordUnderscores: true,
	openLinksInNewWindow: true,
});
// markdown.setFlavor("github")


//$($=>app.main());
$(app.main)
