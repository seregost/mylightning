angular.module("myLightning", ['angularModalService', "ngRoute", 'ngAnimate', 'autoCompleteModule'])
.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
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
