angular.module("myLightning", ['angularModalService', "ngRoute", 'ngAnimate', 'autoCompleteModule'])
.config(['$routeProvider', '$locationProvider',
  function($routeProvider, $locationProvider) {
  $routeProvider
  .when("/", {
    templateUrl : "views/home.html",
    controller: "HomeController",
    reloadOnSearch: false
  })
  .when("/transactions", {
    templateUrl : "views/transactions.html",
    controller: "TransactionController",
    reloadOnSearch: false
  })
  .when("/newaccount", {
    templateUrl : "newaccount.html",
    reloadOnSearch: false
  });
}]);
