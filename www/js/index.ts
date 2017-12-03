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
    // $(document).on('click', '.navbar-collapse.collapse.in a:not(.dropdown-toggle)', function() {
    //     $(this).closest(".navbar-collapse").collapse('hide');
    // });
    // $(document).on('click', '.navbar-collapse.collapse.in button:not(.navbar-toggle)', function() {
    //     $(this).closest(".navbar-collapse").collapse('hide');
    // });
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
//$('#theme').attr('href',"https://maxcdn.bootstrapcdn.com/bootswatch/3.3.7/sandstone/bootstrap.min.css");
app.initialize();
