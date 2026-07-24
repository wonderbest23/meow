export const MANUAL_TRANSFER_BANK = {
  bankName: process.env.MANUAL_TRANSFER_BANK_NAME?.trim() || "카카오뱅크",
  accountNumber: process.env.MANUAL_TRANSFER_ACCOUNT_NUMBER?.trim() || "3333-01-4982733",
  accountHolder: process.env.MANUAL_TRANSFER_ACCOUNT_HOLDER?.trim() || "김주홍",
} as const;

export const MANUAL_TRANSFER_DEPOSIT_HOURS = 24;

export function manualTransferConfigured() {
  return Object.values(MANUAL_TRANSFER_BANK).every((value) => value.length > 0);
}

export function manualTransferPaymentConfigured() {
  return manualTransferConfigured()
    && Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
