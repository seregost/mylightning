(function() {
  'use strict'
  angular.module('myLightning')
  .controller('QRDisplayController', ['$scope', '$element', 'qrinfo', 'lightningService', 'close', function($scope, $element, qrinfo, lightningService, close) {
    $scope.server = lightningService.getServer();
    $scope.qrinfo = qrinfo;

    $scope.close = () => {
      closemodal();
      close($scope.result, 500); // close, but give 500ms for bootstrap to animate
    };

    function closemodal()
    {
      $element.modal('hide');

      // Hack to eliminate backdrop remaining bug.
      $('body').removeClass('modal-open');
      var backdrop = $(".modal-backdrop");
      if(backdrop != null) backdrop.remove();
    }
  }]);
})();
