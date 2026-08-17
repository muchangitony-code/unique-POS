# M-Pesa STK Push

Unique POS supports Daraja Lipa na M-Pesa Online STK Push for open invoices.

## Environment variables

Set these in Railway (never in frontend code):

```text
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=...
MPESA_PASSKEY=...
MPESA_CALLBACK_URL=https://YOUR-RAILWAY-DOMAIN/api/public/mpesa/callback
MPESA_TRANSACTION_TYPE=CustomerPayBillOnline
```

`MPESA_ENV` is `sandbox` or `production`.
`MPESA_TRANSACTION_TYPE` is `CustomerPayBillOnline` or `CustomerBuyGoodsOnline`.

## Callback URL

The callback URL must be a public HTTPS URL. Do not use localhost. Point it at the deployed Railway application and keep the callback path protected with the deployment's configured secret/token mechanism.

## Flow

1. Cashier opens an unpaid or partially-paid invoice.
2. Cashier requests an M-Pesa payment and confirms the customer's phone.
3. The server recomputes the invoice balance and initiates the STK Push.
4. The cashier UI polls the status endpoint while Daraja calls the callback.
5. Only a successful callback creates an `invoice_payments` row.
6. The M-Pesa receipt number is stored and remains linked to the normal payment ledger so an authorised administrator can reverse a test payment without deleting the M-Pesa transaction history.

## Security

Consumer secrets, passkeys and OAuth tokens are server-side only and are never logged. Callback payloads are validated before database writes. Repeated callbacks must be idempotent and may not create duplicate payment rows.

## Local callback simulation

Use the repository's existing authentication/database setup and send a Daraja-shaped callback to the deployed/local callback endpoint. The same `CheckoutRequestID` can be submitted repeatedly; only one payment must be created.

Success callback metadata should contain `MpesaReceiptNumber`, `TransactionDate`, `PhoneNumber` and `Amount`. A non-zero `ResultCode` must resolve the transaction as failed and must not create a payment.

## Go-live checklist

- Create/configure the Daraja production app.
- Set production consumer key/secret, shortcode and passkey in Railway variables.
- Set `MPESA_ENV=production`.
- Set the final public HTTPS callback URL.
- Confirm the callback is reachable from Safaricom infrastructure.
- Test a low-value live transaction.
- Confirm the invoice becomes paid/partial exactly once.
- Confirm the receipt shows M-Pesa and the M-Pesa receipt number.
- Confirm payment reversal preserves the M-Pesa transaction audit record.
