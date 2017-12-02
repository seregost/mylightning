export default class BaseModalController {
  constructor(private $element: any) { }

  public _closemodal()
  {
    this.$element.modal('hide');

    // Hack to eliminate backdrop remaining bug.
    $('body').removeClass('modal-open');
    var backdrop = $(".modal-backdrop");
    if(backdrop != null) backdrop.remove();
  }
}
