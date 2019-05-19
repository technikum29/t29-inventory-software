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

	// how frequently to compute json patch updates
	debouncing_time_ms: 200,
	// a prefix for generated URLS, such as "/app" or so, used in routing
	url_prefix: "",
	// the id key field name
	id_field: "Inv-Nr."  // or: "Inventar-Nr."
};

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

// natural sorting (like ["1", "2", "10"])
var natsort_collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});
naturalsort = lst => lst.sort(collator.compare)

// Filter objects like arrays
filterObj = (obj, check) => Object.keys(obj).reduce((r,e) => { if(check(e,obj[e])) r[e] = obj[e]; return r }, {})
// Escape stuff for regexpes
escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
// Filter out undedined/Nones/False or empty values
withoutNones = lst => lst.filter(e=>e)
// Get all unique values for a certain field
uniqueFieldValues = (obj, key) => withoutNones($.unique($.map(obj, el => el[key])))
// Get all values from a certain field
fieldValues = (obj, key) => withoutNones($.map(obj, el => el[key]))


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
	
	// Setup jsonpatch observation of inventory object.
	// Could also define a callback here.
	var patch_observer = jsonpatch.observe(app.state);
	
	app.send = function() {
		// JSONPatch will show all *pending* changes, i.e. not relative to root document
		var patch = jsonpatch.generate(patch_observer);
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

var setup_components = function() {
	// Register a couple of global Vue components
	
	// Hey, the global mixin. To support the crappy strategy of a global object without vuex
	Vue.mixin({
		data: function() { return { app: app }; }
	});
	// Alternatively and similarly dirty for reactive data: Vue.prototype.$foo = 'bar', access as {{foo}}
	
	app.list_component = Vue.component("InventoryList", {
		template: '#inventory-list',
		data: function() {
			return { // shortcuts to reactive elements:
				inventory: app.state.files.inventory,
				head_commit: app.state.head_commit
			}
		},
		computed: {
			url_for_teaser: function() {
				return this.inventory.map(inv => {
					// this function is moderately expensive :/
					var hash = teaser_image_for(inv[app.id_field])
					if(hash)
						return app.paths["media_path"] + "/" + app.state.media[hash] + ".thumb.jpg"
					else
						return null
				});
				
			}
		}
	});
	
	app.detail_component = Vue.component("InventoryDetail", {
		template: '#inventory-detail',
		props: ["inv"],         // the inventory record looked at
		computed: {
			media: function() { return images_for_id(this.inv[app.id_field]) },
		},
		methods: {
			url_for_media: (hash) => app.paths["media_path"] + "/" + app.state.media[hash]
		},
		mounted: function() {
			// Nice dimming effect of Semantic-UI. Not important, thought.
			$('.cards .image').dimmer({ on: 'hover' });
		}
	});
	
	app.commit_component = Vue.component("CommitView", {
		template: "#commit-view",
		data: function() {
			return { state: app.state }
		},
		methods: { commit: app.commit }
	});
	
	// Allows to view/edit the schema one field a time
	app.schema_editor = Vue.component("SchemaEditor", {
		template: "#schema-editor",
		data: function() {
			return { schema: app.files.schema }
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
	});
	
	app.field_display = Vue.component("FieldDisplay", {
		template: "#field-display",
		props: [
			"inv",         // The inventory record (object)
			"field",       // The name of the field to display (string)
		],
		computed: {
			schema:
				function() { return app.state.files.schema.properties[this.field] || {
					/* default schema */
					editor: "single-line",
					is_default: true
				}; },
			uniqueFieldValues:
				function() { return uniqueFieldValues(app.state.files.inventory, this.field); }
		},
		mounted: function() {
			// Semantic-UI allways allow additions to dropdowns<
			$('.ui.dropdown').dropdown({ allowAdditions: true });
		}
	});
};

var inventory_by_id = function(route) {
	var item = app.state.files.inventory.find(e_inv => e_inv[app.id_field] == route.params.id);
	//console.log("Fand zu ID ",route.params.id," Datensatz ", item);
	return { inv: item,
		 inventory: app.state.files.inventory  // global just for navigation
	};
};

var images_for_id = function(invnr) {
	// Expecting invnr to be a string, as usual.
	// Returns the subset of media witch are matching
	numbermatcher = new RegExp(escapeRegExp("(") + invnr + escapeRegExp(")"))
	return filterObj(app.state.media, (k,v)=> v.match(numbermatcher, "g") && !v.includes(".thumb.jpg"))
}

var teaser_image_for = function(invnr) {
	var images = images_for_id(invnr)
	var keys = Object.keys(images)
	if(keys.length)
		return keys[0] // not the best one
}

var setup_vue_router = function() {
	setup_components();
	
	var routes = [
		{
			path: app.url_prefix + "/",
			redirect: app.url_prefix +"/inv"
		},
		{
			path: app.url_prefix + '/inv',
			component: app.list_component,
			name: "list_all"
		},
		{
			path: app.url_prefix + '/inv/:id',
			component: app.detail_component,
			props: inventory_by_id,
			name: "detail"
		},
		{
			path: app.url_prefix + "/commit",
			component: app.commit_component,
			name: "commit"
		},
		{
			path: app.url_prefix + "/schema",
			component: app.schema_editor,
			name: "schema"
		},
		{ path: '*' },
	];
	
	var router = new VueRouter({ routes });
	
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


app.main = function() {
	load2inv = x => fetch(app.url_prefix + "/" + x).then(res => res.json()).then(res => app[x] = res)
	
	Promise.all(["paths","files","author"].map(load2inv)).then(docs => {
		// Now that we have an author Cookie, load the state
		load2inv("state").then(()=>{
			$("body").removeClass("loading").addClass("loaded")
			setup_uplink()
			setup_vue_router()
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
