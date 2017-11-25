/*
* Licensed to the Apache Software Foundation (ASF) under one
* or more contributor license agreements.  See the NOTICE file
* distributed with this work for additional information
* regarding copyright ownership.  The ASF licenses this file
* to you under the Apache License, Version 2.0 (the
* "License"); you may not use this file except in compliance
* with the License.  You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing,
* software distributed under the License is distributed on an
* "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
* KIND, either express or implied.  See the License for the
* specific language governing permissions and limitations
* under the License.
*/
var app = {
  // Application Constructor
  initialize: function () {
    this.bindEvents();
  },
  // Bind Event Listeners
  //
  // Bind any events that are required on startup. Common events are:
  // 'load', 'deviceready', 'offline', and 'online'.
  bindEvents: function () {
    document.addEventListener('deviceready', this.onDeviceReady, false);
    angular.element(document).ready(function () {
      if (window.cordova) {
        console.log("Running in Cordova, will bootstrap AngularJS once 'deviceready' event fires.");
        document.addEventListener('deviceready', this.onDeviceReady, false);
      } else {
        console.log("Running in browser, bootstrapping AngularJS now.");
        angular.bootstrap(document.body, ['myLightning']);
      }
    });
  },
  // deviceready Event Handler
  //
  // The scope of 'this' is the event. In order to call the 'receivedEvent'
  // function, we must explicitly call 'app.receivedEvent(...);'
  onDeviceReady: function () {
    var storage = window.localStorage;
    var server = storage.getItem("server");

    // Notify system that we are running under phone gap.
    storage.setItem("isPhoneGap", "1")

    if(server == null) {
      window.location.replace("./views/login.html");
    }
    else {
      // Test if we get unauthorized.
      $.get("https://"+storage.getItem("server")+"/rest/v1/ping", () => {
        console.log("Login check has completed, bootstrapping AngularJS.");
        angular.bootstrap(document.body, ['myLightning']);
      }).fail(() =>  window.location.replace("./views/login.html"));
    }
  }
};

app.initialize();
