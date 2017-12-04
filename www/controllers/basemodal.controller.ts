import BroadcastService from '../services/broadcast.service'

export default class BaseModalController {
  constructor(protected $scope: any, private $element: any, private broadcastService : BroadcastService)
  {
    $scope.showinfo = this._showinfo;
  }

  private _showinfo = () => {
    this.broadcastService.send("child:showalert", $("#helptext").html());
  }

  public _closemodal()
  {
    this.$element.modal('hide');

    // Hack to eliminate backdrop remaining bug.
    $('body').removeClass('modal-open');
    var backdrop = $(".modal-backdrop");
    if(backdrop != null) backdrop.remove();
  }
}
