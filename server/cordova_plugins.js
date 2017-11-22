cordova.define('cordova/plugin_list', function(require, exports, module) {
module.exports = [
  {
    "id": "cordova-plugin-device.device",
    "file": "plugins/cordova-plugin-device/www/device.js",
    "pluginId": "cordova-plugin-device",
    "clobbers": [
      "device"
    ]
  },
  {
    "id": "cordova-plugin-hybrid.HybridBridge",
    "file": "plugins/cordova-plugin-hybrid/www/HybridBridge.js",
    "pluginId": "cordova-plugin-hybrid",
    "clobbers": [
      "HybridBridge"
    ]
  },
  {
    "id": "cordova-plugin-inappbrowser-orcas.inappbrowser",
    "file": "plugins/cordova-plugin-inappbrowser-orcas/www/inappbrowser.js",
    "pluginId": "cordova-plugin-inappbrowser-orcas",
    "clobbers": [
      "cordova.InAppBrowser.open",
      "window.open"
    ]
  },
  {
    "id": "cordova-plugin-googleplus.GooglePlus",
    "file": "plugins/cordova-plugin-googleplus/www/GooglePlus.js",
    "pluginId": "cordova-plugin-googleplus",
    "clobbers": [
      "window.plugins.googleplus"
    ]
  },
  {
    "id": "phonegap-plugin-barcodescanner.BarcodeScanner",
    "file": "plugins/phonegap-plugin-barcodescanner/www/barcodescanner.js",
    "pluginId": "phonegap-plugin-barcodescanner",
    "clobbers": [
      "cordova.plugins.barcodeScanner"
    ]
  }
];
module.exports.metadata = 
// TOP OF METADATA
{
  "cordova-plugin-whitelist": "1.3.3",
  "cordova-plugin-device": "1.1.7",
  "cordova-plugin-hybrid": "1.0.0",
  "cordova-plugin-inappbrowser-orcas": "1.4.2-dev",
  "cordova-plugin-googleplus": "5.1.1",
  "phonegap-plugin-barcodescanner": "7.0.0"
};
// BOTTOM OF METADATA
});