(function() {
  'use strict'
  angular.module('myLightning')
  .controller('QRScannerController', ['$scope', '$element', 'close', function($scope, $element, close) {
    $scope.result = "";

    $(document).ready(() => {
      $("#qrreader").html5_qrcode((data, stream) => {
          $scope.result = data;
          closemodal();
          close($scope.result, 500);
        },
        function(error, stream) {
        },
        function(videoError, stream) {
        }
      );
    });
    $scope.close = () => {
      closemodal();
      close($scope.result, 500); // close, but give 500ms for bootstrap to animate
    };
    function closemodal()
    {
      try
      {
        $('#qrreader').html5_qrcode_stop();
        $("#v").remove();
        $("#qr-canvas").remove();
      } catch(e){}

      $element.modal('hide');

      // Hack to eliminate backdrop remaining bug.
      // var backdrop = $(".modal-backdrop");
      // if(backdrop != null) backdrop.fadeOut('fast');
    }
  }]);
})();
