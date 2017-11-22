// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('MainController', ['$scope', 'lightningService', 'ModalService', '$location', function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Variables
    vm.selectedchannel = {"filter": "", "text": "All"};
    vm.selectedalias = {};
    vm.hasaliases = false;
    vm.blockchainsynced = true;
    vm.isloaded = false;
    vm.serverdisconnected = false;
    vm.alerttext = "";

    // Function binding
    vm.refresh = refresh;
    vm.doquickpay = doquickpay;
    vm.docreateinvoice = docreateinvoice;
    vm.dosendpayment = dosendpayment;
    vm.doopenchannel = doopenchannel;
    vm.doqrdisplay = doqrdisplay;
    vm.close = close;

    vm.channelfilterselected = channelfilterselected;
    vm.showaliases =  vm.hasaliases;

    vm.refresh();

    registerTransitions();
    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('signalR', (tmp, data) => {
      if(data.method == "refresh") {
        vm.refresh();
      }
      else if(data.method == "newtransactions") {
        console.log("new payment received");

        var memo = " ";
        if(data.params[0].memo.length > 0)
          memo = " for \""+data.params[0].memo + "\" ";

        _displayalert("You recieved a payment" + memo + "in the amount of "+data.params[0].value.toFixed(4));

        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setInterval(() => {vm.refresh()}, 2000);

        // TODO: Close payment panel.
        data.params.forEach((value) => {
          if(value.payment_request == $('#invoice-code').text()) {
            // If the payment has been recieved, force the modal to close.
            $("#close-invoice").click();
          }
        });
      }
      else if(data.method == "newchannels") {
        _displayalert("A new channel has been opened with the capacity of "+data.params[0].capacity.toFixed(4));
        setInterval(() => {vm.refresh()}, 2000);
      }
    });

    // connection.stateChanged(function (change) {
    //     if (change.newState === $.signalR.connectionState.reconnecting) {
    //         // this should never happen so bail out and force refresh.
    //         vm.serverdisconnected = true;
    //         $scope.$apply();
    //     }
    // });
    //
    // connection.error(function(error) {
    //     console.warn(error);
    // });

    // connection.start().done(function() {
    //     console.log("connection started!");
    // });

    /////////////////

    function channelfilterselected(item, text) {
        vm.selectedchannel.filter = item;
        vm.selectedchannel.text = text;
    }

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
          selectedalias: vm.selectedalias
        }
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
            vm.quickpay = result;
            if(vm.quickpay.success == true)
            {
              _displayalert("You sent a payment to '"+vm.selectedalias.alias+"' in the amount of: "+vm.quickpay.amount.toFixed(4))
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
              _displayalert("You have successfully paid the invoice.")
              vm.refresh();
            }
        });
      });
    }

    /**
    * Open a new channel with another peer.
    */
    function doopenchannel() {
      ModalService.showModal({
        templateUrl: "modals/openchannel.html",
        controller: "OpenChannelController",
      }).then(function(modal) {
          modal.element.modal();
          modal.close.then(function(result) {
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
    * Close a specified channel.
    * @param {string} channelpoint - the channelpoint identifying the channel to close.
    */
    function close(channelpoint) {
      lightningService.execCloseChannel(channelpoint).then((response) => {
        console.log(response);
      });
    }

    /**
    * Refresh data from the server.  Called when page loads or SignalR events happen.
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
        return lightningService.getChannels();
      }).then((response) => {
        vm.channels = response;

        // Update remote IDs to meaningful alias when we have.
        vm.channels.forEach((value) => {
          var keys = Object.keys(vm.quickpaynodes);
          for(var i=0;i<keys.length;i++){
            if(value.node == keys[i]) {
                value.alias = vm.quickpaynodes[keys[i]].alias
            }
          }
        });
        return lightningService.getInfo();
      }).then((response) => {
        vm.info = response;
        vm.blockchainsynced = vm.info.result.synchronized;

        return lightningService.getBalances();
      }).then((response) => {
        vm.balances = {"btcfunds": response.btcfunds/100000, "lntfunds": response.lntfunds/100000};
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

    function _displayalert(message, time)
    {
      vm.alerttext = message;
      $("#alertbox").fadeIn().delay(5000).fadeOut("slow");
    }

    $("#pop").on("click", function() {
       $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
       $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
    });

    function registerTransitions()
    {
      var hammertime = new Hammer(document.getElementById('container'));

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
