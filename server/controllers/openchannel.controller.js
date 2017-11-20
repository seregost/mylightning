(function() {
  'use strict'
  angular.module('myLightning')
  .controller('OpenChannelController', ['$scope', '$element', 'lightningService', 'close', function($scope, $element, lightningService, close) {
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
      if(backdrop != null) backdrop.fadeOut('fast');
    }
  }]);
})();
