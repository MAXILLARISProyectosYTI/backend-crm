export enum ReferralCashbackCurrency {
  PEN = 'PEN',
  USD = 'USD',
}

export enum ReferralCashbackLedgerType {
  EARNED = 'EARNED',
  USED = 'USED',
  ADJUSTMENT = 'ADJUSTMENT',
  EXPIRED = 'EXPIRED',
}

/** SV coin.id: 1 = PEN, 2 = USD */
export function currencyFromSvCoinId(coinId: number | null | undefined): ReferralCashbackCurrency {
  return Number(coinId) === 2 ? ReferralCashbackCurrency.USD : ReferralCashbackCurrency.PEN;
}
