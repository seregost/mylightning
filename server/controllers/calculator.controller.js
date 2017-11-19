'use strict'
angular.module('myLightning')
.controller('CalculatorController', [function() {
  var vm = this;
  vm.sum = function() {
    vm.z = vm.x + vm.y;
  };
}]);
