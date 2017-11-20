// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('MainController', ['$scope', 'lightningService', 'ModalService', function($scope, lightningService, ModalService) {
    var vm = this;
    var connection = $.connection('/signalr');

    // Variables
    vm.selectedchannel = {"filter": "Open", "text": "Open"};
    vm.selectedalias = {};
    vm.hasaliases = false;
    vm.blockchainsynced = true;
    vm.isloaded = false;
    vm.serverdisconnected = false;

    // Function binding
    vm.refresh = refresh;
    vm.doquickpay = doquickpay;
    vm.docreateinvoice = docreateinvoice;
    vm.dosendpayment = dosendpayment;
    vm.doopenchannel = doopenchannel;
    vm.close = close;

    vm.channelfilterselected = channelfilterselected;
    vm.showaliases =  vm.hasaliases;

    vm.refresh();

    // SignalR binding.
    connection.received(function (data) {
      if(data.method == "refresh") {
        console.log("Refreshing account.");
        vm.refresh();
      }
      if(data.method == "newtransactions") {
        console.log("new payment received");
        $("#transaction-box-text").text("New invoice received for \""+data.params[0].memo+"\" in the amount of "+data.params[0].value.toFixed(4))
        $("#transaction-box").fadeIn().delay(5000).fadeOut("slow");

        // Wait a little bit to allow payments to settle.  Then refresh our data.

        setInterval(() => {vm.refresh()}, 5000);
        // Check if we've recieved payment for an open invoice.
        data.params.forEach((value) => {
          if(value.payment_request == $('#invoice-code').text()) {
            // If the payment has been recieved, force the modal to close.
            $("#close-invoice").click();
          }
        });
      }
      if(data.method == "newchannels") {
        console.log("new payment received");
        $("#transaction-box-text").text("A new channel has been opened with the capacity of "+data.params[0].capacity.toFixed(4))
        $("#transaction-box").fadeIn().delay(5000).fadeOut("slow");
        vm.refresh();
      }
    });

    connection.stateChanged(function (change) {
        if (change.newState === $.signalR.connectionState.reconnecting) {
            // this should never happen so bail out and force refresh.
            vm.serverdisconnected = true;
            $scope.$apply();
        }
    });

    connection.error(function(error) {
        console.warn(error);
    });

    connection.start().done(function() {
        console.log("connection started!");
    });

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
      lightningService.getQuickPayNodes().then((aliases) => {
        if(Object.keys(aliases.data).length > 0)
          vm.hasaliases = true;
        vm.quickpaynodes = aliases.data;

        // Set public keys.
        var keys = Object.keys(vm.quickpaynodes);
        for(var i=0;i<keys.length;i++){
          vm.quickpaynodes[keys[i]].pub_key = keys[i];
        }
        return lightningService.getChannels();
      }).then((response) => {
        vm.channels = response.data;

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
        vm.info = response.data;
        vm.blockchainsynced = vm.info.result.synchronized;

        return lightningService.getBalances();
      }).then((response) => {
        vm.balances = response.data;
        vm.balances.btcfunds /= 100000;
        vm.balances.lntfunds /= 100000;
        return lightningService.getUsers()
      }).then((response) => {
        vm.user = response.data;
        return lightningService.getAddress();
      }).then((response) => {
        vm.btcaddress = response.data;

        vm.isloaded = true;
      });
    }

    $("#pop").on("click", function() {
       $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
       $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
    });
  }]);
})();
