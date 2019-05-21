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
	state: {},  // the synced object with the server
	connection: "loading...",
	patch_size: 0, // default, no changes made (yet)
	view_settings: { // Current/default view state/Preferences in display types
		inventory_list: { hide_without_images: true, tabular: false,
			cols: [ "Inv-Nr.", "Objekt", "Beschreibung", "Ort" ]
		}
	},
	global_view_settings: {
		show_editing_infobox: false,
		search_box_content: ''
	},

	// how frequently to compute json patch updates
	debouncing_time_ms: 200,
	// a prefix for generated URLS, such as "/app" or so, used in routing
	url_prefix: "",
	// the id key field name
	id_field: "Inv-Nr."  // or: "Inventar-Nr."
};

// possible caveats: Since I am abusing app also as storage for
//   functions/classes, this could slow down vue.



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
naturalsort = lst => lst.sort(collator.compare)

// Filter objects like arrays
filterObj = (obj, check) => Object.keys(obj).reduce((r,e) => { if(check(e,obj[e])) r[e] = obj[e]; return r }, {})
// Escape stuff for regexpes
escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
// Filter out undedined/Nones/False or empty values
withoutNones = lst => lst.filter(e=>e)
// Unique elements in list (ES6)
unique = lst => [...new Set(lst)].sort()
// Get all unique values for a certain field
uniqueFieldValues = (obj, key) => unique($.map(obj, el => el[key]))
// Get all values from a certain field
fieldValues = (obj, key) => withoutNones($.map(obj, el => el[key]))
// the safest method
deepCopy = obj => JSON.parse(JSON.stringify(obj));


var setup_uplink = function() {
	// setup synchronization routines
	var fqdn_ws_path = "ws://" + window.location.host + app.paths.websocket_path;
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
	
	app.base_files = deepCopy(app.state.files)
	app.base_patch = () => jsonpatch.compare(app.base_files, app.state.files) // maybe interesting for commit review
	
	// Setup jsonpatch observation of inventory object.
	// Could also define a callback here.
	var patch_observer = jsonpatch.observe(app.state);
	
	app.send = function() {
		// JSONPatch will show all *pending* changes, i.e. not relative to root document
		var patch = jsonpatch.generate(patch_observer)
		app.patch_size += patch.length;
		app.websocket.send(JSON.stringify(patch));
	};
	
	app.commit = function() {
		$.getJSON("/commit", { "message": app.state.commit_msg  },
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
	});
	// Alternatively and similarly dirty for reactive data: Vue.prototype.$foo = 'bar', access as {{foo}}
	
	app.views = [
		{
			path: app.url_prefix + '/inv', // aka "the frontpage"
			name: "list_all",
			component: Vue.component("InventoryList", {
				template: '#inventory-list',
				data: function() {
					return { // shortcuts to reactive elements:
						inventory: app.state.files.inventory,
						head_commit: app.state.head_commit,
						view: app.view_settings.inventory_list
					}
				},
				computed: {
					url_for_teaser: function() {
						return this.inventory.map(inv => teaser_url_for_id(inv[app.id_field]))
					}
				}
			})
		},
		{
			path: app.url_prefix + '/inv/:id',
			props: inventory_by_id,
			name: "detail",
			component:  Vue.component("InventoryDetail", {
				template: '#inventory-detail',
				props: ["inv"],         // the inventory record looked at
				data: function() {
					return { schema: app.state.files.schema } // shorthand
				},
				computed: {
					media: function() { return media_urls_for_id(this.inv[app.id_field]) },
				},
				mounted: function() {
					// Nice dimming effect of Semantic-UI. Not important, thought.
					$('.cards .image').dimmer({ on: 'hover' });
				},
				methods: {
					sort_media: function(current_idx, offset) {
						var media = app.state.files.media[this.inv[app.id_field]];
						var new_idx = current_idx + offset;
						
						if(new_idx<0) new_idx = media.length-1; // rotate
						if(new_idx>=media.length) new_idx=0;

						var intermediate_media_new_idx = media[new_idx]; 
						Vue.set(this.app.state.files.media[this.inv[app.id_field]], new_idx, media[current_idx])
						Vue.set(this.app.state.files.media[this.inv[app.id_field]], current_idx, intermediate_media_new_idx)
					},
			     
					remove_media: function(idx) {
						this.app.state.files.media[this.inv[app.id_field]].splice(idx, 1)
					}
				}
			})
		},
		{
			path: app.url_prefix + "/commit",
			name: "commit",
			component: Vue.component("CommitView", {
				template: "#commit-view",
				data: function() {
					return { state: app.state }
				},
				methods: {
					submit: app.commit,
					patch: app.human_readable_patch
				},
			})
		},
		{
			// This is currently a schema editor for all fields. Want to go one field a time.
			path: app.url_prefix + "/schema",
			name: "schema",
			component: Vue.component("SchemaEditor", {
				template: "#schema-editor",
				data: function() {
					return { schema: app.state.files.schema }
				},
				computed: {
					uniqueEditors: function() { return uniqueFieldValues(this.schema.properties, "editor"); }
				},
				methods: {
					uniqueSchemaFieldValues: // doesnt quite work, using computed instead
						field => uniqueFieldValues(app.state.files.schema.properties, field),
					uniqueFieldValues: 
						field => uniqueFieldValues(app.state.files.inventory, field),
					fieldValues:
						field => fieldValues(app.state.files.inventory, field),
					usage: field => {
						file = app.state.files.inventory
						return fieldValues(file, field).length / file.length
					}
				}
			})
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
				function() { return app.state.files.schema.properties[this.field] || {
					/* default schema */
					editor: "single-line",
					is_default: true
				}; },

			// TBD: Move to $root.

			// computing this for every component is quite slow, especially if the page
			// has many of these componens.
			uniqueFieldValues:
				function() {
					var relevantInv = app.state.files.inventory;
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
			$('.ui.dropdown').dropdown({
				allowAdditions: true,
				onBlur: function() { that.editing = false;  }
			}); // -> try differently instead

		}
	});
	
	var router = new VueRouter({
		routes: [].concat(
			[ { path: app.url_prefix + "/", redirect: app.url_prefix +"/inv" } ],
			app.views,
			[ { path: '*' } ]
		),
		base: app.url_prefix
		
	});
	
	// A Vue in order to make app.state reactive across all routes
	//  and also in order to deal with changing data
	var state_vue = new Vue({
		data: app,
		watch: {
			state: { /* "state" property in the Vue data */ 
				handler: debounce(app.send, app.debouncing_time_ms),
				deep: true,
				//immediate: true // called immediately after start of observation
			}
		},	
	});
	
	var app_vue = new Vue({ 
		router: router,
		data: app
	}).$mount('#app');
};

var inventory_by_id = function(route) {
	var item = app.state.files.inventory.find(e_inv => e_inv[app.id_field] == route.params.id);
	//console.log("Fand zu ID ",route.params.id," Datensatz ", item);
	return { inv: item,
		 inventory: app.state.files.inventory  // global just for navigation
	};
};

var media_urls_for_id = function(invnr) {
	// Expecting invnr to be a string, as usual.
	// Returns the subset of media witch are matching
	// numbermatcher = new RegExp(escapeRegExp("(") + invnr + escapeRegExp(")"))
	// return filterObj(app.state.media, (k,v)=> v.match(numbermatcher, "g") && !v.includes(".thumb.jpg"))
	return (app.state.files.media[invnr] || [/* empty list */])
		.map(p => pathJoin([app.paths.media_path, app.paths.media_config.cache_directory, p]))
}

var teaser_url_for_id = function(invnr) {
	//var images = images_for_id(invnr)
	//var keys = Object.keys(images)
	//if(keys.length)
	//	return keys[0] // not the best one
	var imgs = media_urls_for_id(invnr);
	if(imgs.length)
		return imgs[0] + app.paths.media_config.square_thumbnail_suffix
}


app.main = function() {
	load2inv = x => fetch(app.url_prefix + "/" + x).then(res => res.json()).then(res => app[x] = res)
	
	Promise.all(["paths","files","author"].map(load2inv)).then(docs => {
		// Now that we have an author Cookie, load the state
		load2inv("state").then(()=>{
			setup_uplink()
			setup_vue()
			$("body").removeClass("loading").addClass("loaded")
		})
		$("#loader").text("Loading even more...")
	}, /*failure*/()=>{
		$("#loader").text("Failed to load.")
	})
	
	$("#loader").text("Loading...")
	$("body").addClass("loading")
};

//$($=>app.main());
$(app.main)
