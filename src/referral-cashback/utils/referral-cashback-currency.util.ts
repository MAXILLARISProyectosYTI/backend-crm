import { ReferralCashbackCurrency } from '../enums/referral-cashback.enums';

export const CASHBACK_ACCOUNT_CURRENCY = ReferralCashbackCurrency.USD;

export function roundCashbackMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Convierte un monto a USD usando el TC de la factura (soles por dólar).
 * PEN → USD: amount / exchangeRate
 */
export function convertCashbackAmountToUsd(
  amount: number,
  currency: ReferralCashbackCurrency,
  exchangeRate: number | null | undefined,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (currency === ReferralCashbackCurrency.USD) {
    return roundCashbackMoney(amount);
  }
  const rate = Number(exchangeRate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return roundCashbackMoney(amount / rate);
}
