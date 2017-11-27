(function() {
  'use strict'
  angular.module('myLightning')
  .controller('VerificationController', ['$scope', '$element', 'message', 'close', function($scope, $element, message, close) {
    $scope.verification = {};
    $scope.verification.message = message;

    $(document).ready(() => {
      $("#password").focus();
    });

    $scope.confirm = () => {
      $scope.verification.confirmed = true;
      closemodal();
      close($scope.verification); // close, but give 500ms for bootstrap to animate
    }
    $scope.close = () => {
      $scope.verification.confirmed = false;
      closemodal();
      close($scope.verification); // close, but give 500ms for bootstrap to animate
    };

    function closemodal()
    {
      $element.modal('hide');
    }
  }]);
})();
