export type TradingStrategy = 'EMA_SCALPING' | 'MA_CROSSOVER' | 'RSI_SCALPING' | 'Sakti-Scalper';

export interface ActiveTrade {
  id: string;
  coin: string;
  buyPrice: number;
  amount: number;
  targetTP: number;
  targetSL: number;
  highestPrice: number;
  currentPrice: number;
  hardStopOrderId?: string;
  orderId?: string;
  timestamp: number;
  strategy: TradingStrategy;
  signal?: string;
  isSimulation: boolean;
}

export interface TradeHistory {
    id?: string;
    coin: string;
    trade_type: 'PROFIT' | 'LOSS' | string;
    buy_price: number;
    sell_price: number;
    profit_percent: number;
    timestamp: number;
    is_simulation: boolean;
    date?: string;
    time?: string;
}

export interface BotSettings {
  isBotActive: boolean;
  tradeAmount: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  maxActivePositions: number;
  btcCrashThreshold: number;
  dailyLossLimit: number;
  isSimulation: boolean;
  activeStrategy: TradingStrategy;
}
