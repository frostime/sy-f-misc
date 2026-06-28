/* eslint-disable no-undef */

var ENDPOINT_PREFIX = "/f-zotero-ext/api/v1";
var STATUS_ENDPOINT = ENDPOINT_PREFIX + "/status";
var SELECTED_ENDPOINT = ENDPOINT_PREFIX + "/selected";
var registeredEndpoints = [];

function log(message) {
  try {
    if (typeof Zotero !== "undefined" && Zotero.debug) {
      Zotero.debug("SiYuan Bridge: " + message);
    } else if (typeof dump !== "undefined") {
      dump("SiYuan Bridge: " + message + "\n");
    }
  } catch (_e) {}
}

function jsonResponse(status, payload) {
  return [status, "application/json", JSON.stringify(payload)];
}

function safeField(item, field) {
  try {
    return item.getField(field) || "";
  } catch (_e) {
    return "";
  }
}

function getItemTypeName(item) {
  try {
    return Zotero.ItemTypes.getName(item.itemTypeID) || "";
  } catch (_e) {
    return item.itemType || "";
  }
}

function getCreators(item) {
  try {
    if (typeof item.getCreatorsJSON === "function") {
      return item.getCreatorsJSON();
    }
  } catch (_e) {}

  try {
    return item.getCreators().map(function (creator) {
      var creatorType = "";
      try {
        creatorType = Zotero.CreatorTypes.getName(creator.creatorTypeID) || "";
      } catch (_e) {}
      return {
        firstName: creator.firstName || "",
        lastName: creator.lastName || "",
        fieldMode: creator.fieldMode || 0,
        creatorType: creatorType,
      };
    });
  } catch (_e) {
    return [];
  }
}

function itemToJSON(item) {
  return {
    key: item.key || "",
    itemType: getItemTypeName(item),
    title: safeField(item, "title"),
    creators: getCreators(item),
    date: safeField(item, "date"),
    url: safeField(item, "url"),
    DOI: safeField(item, "DOI"),
  };
}

function registerEndpoint(path, endpointClass) {
  Zotero.Server.Endpoints[path] = endpointClass;
  registeredEndpoints.push(path);
  log("registered " + path);
}

function install(data, reason) {}

async function startup(data, reason) {
  await Zotero.initializationPromise;

  var id = data && data.id ? data.id : "f-zotero-ext@frostime.github.io";
  var version = data && data.version ? data.version : "unknown";

  if (!Zotero.Server || !Zotero.Server.Endpoints) {
    throw new Error("Zotero.Server.Endpoints is not available");
  }

  registerEndpoint(
    STATUS_ENDPOINT,
    class {
      constructor() {
        this.supportedMethods = ["GET"];
        this.permitBookmarklet = false;
      }

      async init(request) {
        return jsonResponse(200, {
          ok: true,
          plugin: id,
          version: version,
          zotero: Zotero.version,
        });
      }
    }
  );

  registerEndpoint(
    SELECTED_ENDPOINT,
    class {
      constructor() {
        this.supportedMethods = ["GET"];
        this.permitBookmarklet = false;
      }

      async init(request) {
        try {
          var pane = Zotero.getActiveZoteroPane && Zotero.getActiveZoteroPane();
          if (!pane || typeof pane.getSelectedItems !== "function") {
            return jsonResponse(503, {
              ok: false,
              error: "No active Zotero pane or item selection API unavailable",
            });
          }

          var items = pane.getSelectedItems() || [];
          return jsonResponse(200, {
            ok: true,
            count: items.length,
            items: items.map(itemToJSON),
          });
        } catch (e) {
          return jsonResponse(500, {
            ok: false,
            error: String(e && e.message ? e.message : e),
          });
        }
      }
    }
  );

  log("startup complete");
}

async function onMainWindowLoad(data, reason) {}

async function onMainWindowUnload(data, reason) {}

function shutdown(data, reason) {
  try {
    if (typeof Zotero !== "undefined" && Zotero.Server && Zotero.Server.Endpoints) {
      for (var i = 0; i < registeredEndpoints.length; i++) {
        delete Zotero.Server.Endpoints[registeredEndpoints[i]];
        log("unregistered " + registeredEndpoints[i]);
      }
    }
  } finally {
    registeredEndpoints = [];
  }
}

function uninstall(data, reason) {}
