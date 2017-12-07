import LNDLightning from './lnd';

export interface ILightning {
  PubKey: string;
  ShouldUpdate: boolean;
  NewTransactions: Array<any>;
  NewChannels: Array<any>;

  SendInvoice(invoiceid: string, alias: string): Promise<any>;
  QuickPay(pub_key: string, amount: number, memo: string): Promise<any>;
  CreateInvoice(memo: string, amount: number, quickpay: boolean): Promise<any>;

  AddContact(alias: string, nodeid: string, server: string): Promise<any>;

  OpenChannel(nodeid: string, amount: number): Promise<any>;
  CloseChannel(channelid: string): Promise<any>;

  Close(): void;
}

export class LightningFactory {
  public static getLightning(userid: string, rpcport: number, peerport: number): ILightning {
    // TODO: instance class per config.
    var node: ILightning = new LNDLightning(userid, rpcport, peerport);
    return node;
  }
}
