export interface IndodaxTicker {
  high: string;
  low: string;
  vol_idr: string;
  vol_coin: string;
  last: string;
  buy: string;
  sell: string;
  server_time: number;
}

export interface IndodaxOrder {
  order_id: string;
  order_type: 'buy' | 'sell';
  price: string;
  type: string;
  submit_time: string;
  finish_time: string;
  status: string;
  order_id_parent?: string;
  order_id_child?: string;
}

export interface IndodaxBalance {
  [key: string]: string;
}

export interface IndodaxUserInfo {
  balance: IndodaxBalance;
  balance_hold: IndodaxBalance;
  address: { [key: string]: string };
  user_id: string;
  profile_picture: string;
  name: string;
  email: string;
}
