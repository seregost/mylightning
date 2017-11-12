const lightning = require('./lightning/lnd');
const qr = require('qr-image');
const fs = require('fs');
const sortJsonArray = require('sort-json-array');

// Main angular logic.
var myApp = angular.module('myApp', []);
function Main($scope, $http)
{
  $http.get('./json/channels.json').success(function(data) {
    $scope.channels = data;

    }).error(function(data, status) {
      alert('get data error!');
  });

  $scope.refresh = function (){
      $http.get('./json/channels.json').success(function(data) {
        $scope.channels = data;
     });
   }
}

// Bitcoin/Lightning network periodic refresh.
function refreshChannels() {
  var channels = [];
  var test = [];
  lightning.channels(function(channels) {
    sortJsonArray(channels, 'channel');
    fs.writeFileSync('./json/channels.json', JSON.stringify(channels))

    lightning.getbalance(function(balance) {
      lightning.getfunds(function(funds) {
        $('#btc-funds').text((balance+funds).toFixed(4))
        $('#lnt-funds').text(funds.toFixed(4))

        var scope = angular.element(document.getElementById('container')).scope();
        scope.refresh();
      });
    });
  });
}
setInterval(refreshChannels, 5000);

// Form logic.
$(document).ready(function () {
  $('#payment-form').bootstrapValidator({
    feedbackIcons: {
        valid: 'glyphicon glyphicon-ok',
        invalid: 'glyphicon glyphicon-remove',
        validating: 'glyphicon glyphicon-refresh'
    },
    fields: {
      invoice: {
          validators: {
                stringLength: {
                min: 2,
            },
                notEmpty: {
                message: 'Please supply an invoice code'
            }
          }
        }
      }
    })
    $('#openchannel-form').bootstrapValidator({
      feedbackIcons: {
          valid: 'glyphicon glyphicon-ok',
          invalid: 'glyphicon glyphicon-remove',
          validating: 'glyphicon glyphicon-refresh'
      },
      fields: {
        remotenode: {
            validators: {
                  stringLength: {
                  min: 2,
              },
                  notEmpty: {
                  message: 'Please specify a remote node.'
              }
            }
          }
        }
      })
  });

$(() => {
  lightning.getinfo(function(response) {
    $('#address').text(response.result.nodeId)
    $('#alias').text(response.result.alias)
    $('#port').text(response.result.port)

    var qr_svg = qr.image(
      response.result.nodeId + "@" +
      response.result.alias + ".com:" +
      response.result.port, {type: 'png'});
    qr_svg.pipe(require('fs').createWriteStream('serverqr.png'));
  });

  lightning.peers(function(response) {

  });

  $('#send-invoice').bind("click",function(){
    var invoice = $('#invoice').val();
    if(invoice.length > 0)
    {
      lightning.send(invoice, function(response) {
        if(response.error == null) {
          refreshChannels();
          $('#payment-form').trigger('reset');
          $('#payment-validation-error').hide();
          $('#sendpaymentmodal').modal('toggle');
        }
        else
        {
            $('#payment-validation-error').show();
            $('#payment-validation-text').text(response.error.message);
        }
      });
    }
  });

  $('#send-payment').click(function() {
    $('#sendpaymentmodal').modal('show');
  });

  $('#open-channel').click(function() {
    $('#openchannelmodal').modal('show');
  });

  $('#submit-channel').bind("click", function() {
    var remotenode = $('#remotenode').val();
    var amount = $('#amount').val();
    if(remotenode.length > 0 && amount > 0)
    {
      lightning.openchannel(remotenode, amount, function(response) {
        if(response.error == null) {
          refreshChannels();
          $('#openchannel-form').trigger('reset');
          $('#channel-validation-error').hide();
          $('#openchannelmodal').modal('toggle');
        }
        else
        {
            $('#channel-validation-error').show();
            $('#channel-validation-text').text(response.error.message);
        }
      });
    }
  });

  $("#pop").on("click", function() {
     $('#imagepreview').attr('src', $('#imageresource').attr('src')); // here asign the image to the modal when the user click the enlarge link
     $('#imagemodal').modal('show'); // imagemodal is the id attribute assigned to the bootstrap modal, then i use the show function
  });
})
