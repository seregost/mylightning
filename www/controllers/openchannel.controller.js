(function() {
  'use strict'
  angular.module('myLightning')
  .controller('OpenChannelController', ['$scope', '$element', 'ModalService', 'lightningService', 'close', function($scope, $element, ModalService, lightningService, close) {
    $scope.openchannel = {};
    $scope.doqrscanner = () => {
      if(window.cordova != null) {
        cordova.plugins.barcodeScanner.scan(
          function (result) {
            if(!result.cancelled) {
              if(result.format == "QR_CODE") {
                $scope.openchannel.remotenode = result.text;
                $scope.$apply();
              }
            }
          },
          function (error) {
            alert("Scanning failed: " + error);
          }
        );
      }
      else {
        // angular.element('#quickpaymodal').modal('show');
        ModalService.showModal({
          templateUrl: "modals/qrscanner.html",
          controller: "QRScannerController",
        }).then(function(modal) {
          // The modal object has the element built, if this is a bootstrap modal
          // you can call 'modal' to show it, if it's a custom modal just show or hide
          // it as you need to.
          modal.element.modal();
          modal.close.then(function(result) {
            $scope.openchannel.remotenode = result;
          });
        });
      }
    }
    $scope.openchannel = () => {
      var remotenode = $scope.openchannel.remotenode;
      var amount = $scope.openchannel.amount;

      if(amount > 0) {
        $scope.openchannel.loading=true;

        lightningService.execOpenChannel(remotenode, amount).then((response) => {
          if(response.data.error == null) {
            $scope.openchannel.haserror = false;

            closemodal();
            close($scope.openchannel, 500);
          }
          else {
              $scope.openchannel.haserror = true;
              $scope.openchannel.error = response.data.error.message;
          }
          $scope.openchannel.loading = false;
        });
      }
    }
    $scope.close = () => {
      closemodal();
      close($scope.openchannel, 500); // close, but give 500ms for bootstrap to animate
    };
    function closemodal()
    {
      $element.modal('hide');

      // Hack to eliminate backdrop remaining bug.
      var backdrop = $(".modal-backdrop");
      if(backdrop != null) backdrop.remove();
    }
  }]);
})();
