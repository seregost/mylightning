describe('calculator.controller', function () {
  beforeEach(module('myLightning'));

  var $controller;

  beforeEach(inject(function(_$controller_){
    $controller = _$controller_;
  }));

  describe('sum', function () {
		it('1 + 1 should equal 2', function () {
			var $scope = {};
			var controller = $controller('CalculatorController', { $scope: $scope });
			controller.x = 1;
			controller.y = 2;
			controller.sum();
			expect(controller.z).toBe(3);
		});
	});
});
