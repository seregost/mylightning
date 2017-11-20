(function() {
  'use strict'
  angular.module('myLightning')
  .controller('SendQuickPayController', ['$scope', '$element', 'selectedalias', 'lightningService', 'close', function($scope, $element, selectedalias, lightningService, close) {
    $scope.selectedalias = selectedalias;
    $scope.sendquickpay = () => {
      var dest = $scope.selectedalias.pub_key;
      var memo = $scope.quickpay.memo;
      var amount = $scope.quickpay.amount;

      if(amount > 0) {
        $scope.quickpay.loading=true;

        lightningService.execQuickPay(dest, amount, memo).then((response) => {
          if(response.data.error == null) {
            $scope.quickpay.haserror = false;

            closemodal();
            close($scope.quickpay, 500);
          }
          else {
              $scope.quickpay.haserror = true;
              $scope.quickpay.error = response.data.error.message;
          }
          $scope.quickpay.loading = false;
        });
      }
    }
    $scope.close = () => {
      closemodal();
      close($scope.quickpay, 500); // close, but give 500ms for bootstrap to animate
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
