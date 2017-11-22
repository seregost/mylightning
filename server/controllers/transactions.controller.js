// Main angular logic.
(function() {
  'use strict'
  angular.module('myLightning')
  .controller('TransactionController', ['$scope', 'lightningService', 'ModalService', '$location', function($scope, lightningService, ModalService, $location) {
    var vm = this;

    // Function binding
    vm.refresh = refresh;

    vm.refresh();

    /**
    * SignalR receive message loop.
    * @param {json} data - contains type of update and any paramaters
    */
    $scope.$on('server:message', (tmp, data) => {
      if(data.method == "refresh") {
        vm.refresh();
      }
      else if(data.method == "newtransactions") {
        // Wait a little bit to allow payments to settle.  Then refresh our data.
        setInterval(() => {vm.refresh()}, 2000);
      }
      else if(data.method == "newchannels") {
        setInterval(() => {vm.refresh()}, 2000);
      }
    });

    /**
    * Refresh data from the server.  Called when page loads or SignalR events happen.
    */
    function refresh(){
      lightningService.waitSync().then(() => {
        return lightningService.getQuickPayNodes();
      }).then((aliases) => {
        // TODO: Implement refresh.
      });
    }

    $("#pop").on("click", function() {
       $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
       $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
    });

  }]);
})();
