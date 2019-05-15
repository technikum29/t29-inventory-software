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


/* The global "inv" object is the global State managed by Vue.
 * However, only "state" is observed by jsonpatch and synced
 * between server and client. All other objects are client-local.
 */
var inv = {
	state: { inventory: [] },  // sensible defaults
	connection: "loading...",
	patch_size: 0, // default, no changes made (yet)

	// how frequently to compute json patch updates
	debouncing_time_ms: 200,
	url_prefix: "",  // such as "/app" or so
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

function baseName(str)
{
   var base = new String(str).substring(str.lastIndexOf('/') + 1); 
    if(base.lastIndexOf(".") != -1)       
        base = base.substring(0, base.lastIndexOf("."));
   return base;
};

// Filter objects like arrays
filterObj = (obj, check) => Object.keys(obj).reduce((r,e) => { if(check(e,obj[e])) r[e] = obj[e]; return r }, {})
// Escape stuff for regexpes
escapeRegExp = string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string

var setup_uplink = function() {
	// setup synchronization routines
	var fqdn_ws_path = "ws://" + window.location.host + inv.paths.websocket_path;
	inv.websocket = new WebSocket(fqdn_ws_path); // allow the state to be displayed by vue
	
	var msg_counter = 0;
	inv.websocket.onmessage = evt => {
		//msg = JSON.parse(evt.data)
		// Initial message is the initial state
		//if(msg_counter++ == 0) inv.state = msg
		console.log("Recieved ", msg)
	}
	
	inv.websocket.onopen = evt => inv.connection = "connected"
	inv.websocket.onclose = evt => inv.connection = "closed"
	
	// Setup jsonpatch observation of inventory object.
	// Could also define a callback here.
	var patch_observer = jsonpatch.observe(inv.state);
	
	inv.send = function() {
		// JSONPatch will show all *pending* changes, i.e. not relative to root document
		var patch = jsonpatch.generate(patch_observer);
		inv.patch_size += patch.length;
		inv.websocket.send(JSON.stringify(patch));
	};
	
	inv.commit = function() {
		$.getJSON("/commit", { "message": inv.state.commit_msg  },
			  res => console.log(res)
		)
		// maybe reloading the page is a good idea now.
	}
};

var setup_components = function() {
	// Register a couple of global Vue components
	
	inv.list_component = Vue.component("InventoryList", {
		template: '#inventory-list',
		props: ["inventory", "head_commit"],
		methods: {
			url_for_teaser: function(local_inv) {
				var hash = teaser_image_for(local_inv["Inventur-Nr"])
				if(hash)
					return inv.paths["media_path"] + "/" + inv.state.media[hash]
				else
					return null
				
			}
		}
	});
	
	inv.detail_component = Vue.component("InventoryDetail", {
		template: '#inventory-detail',
		props: ["inv",         // inv is an object, not an id
		        "inventory",   // the watched state
		],
		computed: {
			media: function() { return images_for_id(this.inv["Inventur-Nr"]) },
		},
		methods: {
			url_for_media: (hash) => inv.paths["media_path"] + "/" + inv.state.media[hash]
		},
		mounted: function() {
			// Nice dimming effect of Semantic-UI. Not important, thought.
			$('.cards .image').dimmer({ on: 'hover' });
		}
	});
	
	inv.commit_component = Vue.component("CommitView", {
		template: "#commit-view",
		props: [ "state" ],
		methods: { commit: inv.commit }
	});
};

var inventory_by_id = function(route) {
	var item = inv.state.files.inventory.find(e_inv => e_inv["Inventur-Nr"] == route.params.id);
	//console.log("Fand zu ID ",route.params.id," Datensatz ", item);
	return { inv: item,
		 inventory: inv.state.files.inventory  // global just for navigation
	};
};

var images_for_id = function(invnr) {
	// Expecting invnr to be a string, as usual.
	// Returns the subset of media witch are matching
	return filterObj(inv.state.media, (k,v)=>v.match(new RegExp(escapeRegExp("(") + invnr + escapeRegExp(")"), "g")))
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
			path: inv.url_prefix + "/",
			redirect: inv.url_prefix +"/inv"
		},
		{
			path: inv.url_prefix + '/inv',
			component: inv.list_component,
			props: { inventory: inv.state.files.inventory, head_commit: inv.state.head_commit},
			name: "list_all"
		},
		{
			path: inv.url_prefix + '/inv/:id',
			component: inv.detail_component,
			props: inventory_by_id,
			name: "detail"
		},
		{
			path: inv.url_prefix + "/commit",
			component: inv.commit_component,
			props: inv,
			name: "commit"
		},
		{ path: '*' },
	];
	
	var router = new VueRouter({ routes });
	
	// A Vue in order to make inv.state reactive across all routes
	//  and also in order to deal with changing data
	var state_vue = new Vue({
		data: inv,
		watch: {
			state: { /* "state" property in the Vue data */ 
				handler: debounce(inv.send, inv.debouncing_time_ms),
				deep: true,
				//immediate: true // called immediately after start of observation
			}
		},	
	});
	
	
	var app = new Vue({ 
		router: router,
		data: inv
	}).$mount('#app');
};


inv.main = function() {
	load2inv = x => fetch(inv.url_prefix + "/" + x).then(res => res.json()).then(res => inv[x] = res)
	
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

//$($=>inv.main());
$(inv.main)
