// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('MainController', ['$scope', 'lightningService', 'ModalService', '$location', function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Variables
    vm.blockchainsynced = true;
    vm.isloaded = false;
    vm.serverdisconnected = false;
    vm.alerttext = "";

    // Function binding
    vm.refresh = refresh;
    vm.changescreen = changescreen;

    vm.refresh();

    _registerTransitions();

    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('server:message', (tmp, data) => {
      if(data.method == "refresh") {
        setInterval(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newtransactions") {
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

    /**
    * Event recieved when we detect a server disconnect.  Notify the user to refresh.
    */
    $scope.$on('server:disconnected', (tmp, data) => {
      vm.serverdisconnected = true;
      $scope.$apply();
    });

    /**
    * Refresh data from the server.  Called when page loads or lightning:message events happen.
    */
    function refresh(){
      lightningService.waitSync().then(() => {
        return lightningService.getInfo();
      }).then((response) => {
        vm.info = response;
        vm.blockchainsynced = vm.info.result.synchronized;
        $scope.$apply();
        return lightningService.getBalances();
      });
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
    function _displayalert(message, time)
    {
      vm.alerttext = message;
      $scope.$apply();
      $("#alertbox").fadeIn().delay(5000).fadeOut("slow");
    }

    /**
    * Register hammer transition detectors to know when screen is swiped.
    */
    function _registerTransitions()
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
