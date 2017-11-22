angular.module("myLightning", ['angularModalService', "ngRoute", 'ngAnimate'])
.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $locationProvider.html5Mode(true);
  $routeProvider
  .when("/", {
    templateUrl : "views/home.html",
    controller: "HomeController"
  })
  .when("/transactions", {
    templateUrl : "views/transactions.html",
    controller: "TransactionController"
  });
}]);
