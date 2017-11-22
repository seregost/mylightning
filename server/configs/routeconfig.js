angular.module("myLightning", ['angularModalService', "ngRoute", 'ngAnimate'])
.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
  .when("/", {
    templateUrl : "home.html",
    controller: "MainController"
  })
  .when("/transactions", {
    templateUrl : "transactions.html",
    controller: "MainController"
  });
}]);
