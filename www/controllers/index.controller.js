(function() {
  'use strict'
  angular.module('myLightning')
  .controller('MainController', ['$scope', 'LightningService', 'ModalService', '$location',
  function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Variables
    vm.blockchainsynced = true;
    vm.isloaded = false;
    vm.serverdisconnected = false;
    vm.alerttext = "";

    // Function binding
    vm.refresh = refresh;
    vm.changescreen = changescreen;
    vm.doquickpay = doquickpay;
    vm.docreateinvoice = docreateinvoice;
    vm.dosendpayment = dosendpayment;
    vm.doqrdisplay = doqrdisplay;

    vm.dologout = dologout;

    vm.refresh();

    _registerTransitions();

    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('server:message', (tmp, data) => {
      if(data.method == "refresh") {
        setTimeout(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newtransactions") {
        var memo = " ";
        if(data.params[0].memo.length > 0)
          memo = " for \""+data.params[0].memo + "\" ";

        _displayalert("You recieved a payment" + memo + "in the amount of "+data.params[0].value.toFixed(2));
        _displaynotification("Payment Recieved", "You recieved a payment" + memo + "in the amount of "+data.params[0].value.toFixed(2));

        $scope.$apply();
        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setTimeout(() => {vm.refresh()}, 2000);

        // TODO: Close payment panel.
        data.params.forEach((value) => {
          if(value.payment_request == $('#invoice-code').text()) {
            // If the payment has been recieved, force the modal to close.
            $("#close-invoice").click();
          }
        });
      }
      else if(data.method == "newchannels") {
        _displayalert("A new channel has been opened with the capacity of "+data.params[0].capacity.toFixed(2));
        $scope.$apply();
        setTimeout(() => {vm.refresh()}, 2000);
      }
    });

    /**
    * Event recieved when we detect a server disconnect.  Notify the user to refresh.
    */
    $scope.$on('server:disconnected', (tmp, data) => {
      vm.serverdisconnected = true;
      $scope.$apply();
    });

    /**
    * Event recieved when we detect a server re-connect.
    */
    $scope.$on('server:connected', (tmp, data) => {
      vm.serverdisconnected = false;
      $scope.$apply();
    });

    /**
    * Event recieved when a child controller wants to show an alert.
    */
    $scope.$on('child:showalert', (tmp, data) => {
      _displayalert(data);
    });

    /**
    * View event to run the quick pay process.
    * @param {string} pub_key - public key of the selected alias.
    */
    function doquickpay(pub_key) {
      vm.selectedalias = vm.quickpaynodes[pub_key];
      ModalService.showModal({
        templateUrl: "modals/sendquickpay.html",
        controller: "SendQuickPayController",
        inputs: {
          quickpaynodes: vm.quickpaynodes,
          selectednodeid: pub_key
        }
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
            vm.quickpay = result;
            if(vm.quickpay.success == true)
            {
              $scope.$emit("child:showalert",
                "You sent a payment to '"+vm.quickpay.alias+"' in the amount of: "+vm.quickpay.amount.toFixed(2));
              vm.refresh();
            }
        });
      });
    }

    /**
    * Generate an invoice with QR code and id.
    */
    function docreateinvoice() {
      ModalService.showModal({
        templateUrl: "modals/createinvoice.html",
        controller: "CreateInvoiceController",
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
        });
      });
    }

    /**
    * Send a payment with the scanned QR code.
    */
    function dosendpayment() {
      ModalService.showModal({
        templateUrl: "modals/sendpayment.html",
        controller: "SendPaymentController",
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
            vm.sendpayment = result;
            if(vm.sendpayment.success == true)
            {
              $scope.$emit("child:showalert",
                "You have successfully paid the invoice.");
              vm.refresh();
            }
        });
      });
    }

    function doqrdisplay(caption, qrcode)
    {
      ModalService.showModal({
        templateUrl: "modals/qrdisplay.html",
        controller: "QRDisplayController",
        inputs: {
          qrinfo : {"caption": caption, "inputcode": qrcode}
        }
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
        });
      });
    }

    /**
    * Refresh data from the server.  Called when page loads or lightning:message events happen.
    */
    function refresh(){
      lightningService.waitSync().then(() => {
        return lightningService.getQuickPayNodes();
      }).then((aliases) => {
        if(Object.keys(aliases).length > 0)
          vm.hasaliases = true;
        vm.quickpaynodes = aliases;

        // Set public keys.
        var keys = Object.keys(vm.quickpaynodes);
        for(var i=0;i<keys.length;i++){
          vm.quickpaynodes[keys[i]].pub_key = keys[i];
        }
        return lightningService.getInfo();
      }).then((response) => {
        vm.info = response;
        vm.blockchainsynced = vm.info.synchronized;
        $scope.$apply();
        return lightningService.getBalances();
      }).then((response) => {
        vm.balances = {"btcfunds": response.btcfunds, "lntfunds": response.lntfunds};
        return lightningService.getUsers()
      }).then((response) => {
        vm.user = response;
        return lightningService.getAddress();
      }).then((response) => {
        vm.btcaddress = response;
        vm.isloaded = true;

        $scope.$apply();
      });
    }

    function dologout()
    {
      lightningService.execLogout();
      if(window.localStorage.getItem("isPhoneGap") == "1")
        window.location.replace("./views/login.html");
      else
        window.location.replace("/login");
    }

    function changescreen(screenname)
    {
      $scope.whichWayToMove = ''
      $("#gohome").removeClass();
      $("#gotransactions").removeClass();
      $("#gosettings").removeClass();

      $(screenname).attr('class', 'active');
    }
    /**
    * Displays the alert box and then fade out after 5 seconds.
    */
    function _displayalert(message)
    {
      $("#alertbox").finish();
      vm.alerttext = message;
      $("#alertbox").fadeIn().animate({opacity:1},2000).fadeOut();
    }

    /**
    * Display a device notification if possible.
    */
    function _displaynotification(msgtitle, message)
    {
      if(cordova != null) {
        if(cordova.plugins.notification != null)
        {
          cordova.plugins.notification.local.schedule({
              title: msgtitle,
              text: message,
              foreground: true
          });
        }
      }
    }

    /**
    * Register hammer transition detectors to know when screen is swiped.
    */
    function _registerTransitions()
    {
      var hammertime = new Hammer(document.getElementById('movableview'));

      hammertime.on('swipeleft', function(ev) {
        $scope.whichWayToMove = 'slide_from_left_to_right';

        $location.path('/transactions');
        $scope.$apply();
      });
      hammertime.on('swiperight', function(ev) {
        $scope.whichWayToMove = 'slide_from_right_to_left';

        $location.path('/');
        $scope.$apply();
      });
    }
  }]);
})();
