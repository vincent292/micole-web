import { request } from "node:https";
import { Buffer } from "node:buffer";

export const banecoEnvironments = {
  certification: "https://apimktdesa.baneco.com.bo/ApiGateway/",
  production: "https://apimkt.baneco.com.bo/ApiGateway/",
} as const;
export type BanecoEnvironment = keyof typeof banecoEnvironments;
export interface BankCredentials { userName: string; password: string; aesKey: string; accountCredit: string; encryptionMode: "bank_api" | "pre_encrypted" }
export function readCredentials(value: unknown): BankCredentials {
 if (!value || typeof value !== "object" || Array.isArray(value)) throw new BanecoError("bank-invalid-credentials");
 const row=value as Record<string,unknown>;
 for(const key of ["userName","password","accountCredit"]) if(typeof row[key]!=="string" || !(row[key] as string).length || (row[key] as string).length>512)throw new BanecoError("bank-invalid-credentials");
 if(!["bank_api","pre_encrypted"].includes(String(row.encryptionMode)) || typeof row.aesKey!=="string" || row.aesKey.length>256 || (row.encryptionMode==="bank_api"&&!row.aesKey))throw new BanecoError("bank-invalid-credentials");
 return {userName:String(row.userName).trim(),password:String(row.password),aesKey:String(row.aesKey),accountCredit:String(row.accountCredit),encryptionMode:row.encryptionMode as BankCredentials["encryptionMode"]};
}

export type BankStage = "password-encryption" | "authentication" | "account-encryption" | "generation" | "status" | "cancellation";
export class BanecoError extends Error {
  constructor(public code: string, public stage?: BankStage, public httpStatus?: number, public bankCode?: number, public qrId?: string) {
    super(code); this.name = "BanecoError";
  }
}
export function bankErrorDetails(error: unknown) {
  const knownStages: BankStage[] = ["password-encryption", "authentication", "account-encryption", "generation", "status", "cancellation"];
  const safe = error instanceof BanecoError ? error : null;
  return {
    last_error_stage: safe?.stage && knownStages.includes(safe.stage) ? safe.stage : null,
    last_http_status: safe?.httpStatus && Number.isInteger(safe.httpStatus) && safe.httpStatus >= 100 && safe.httpStatus <= 599 ? safe.httpStatus : null,
    last_bank_code: safe?.bankCode !== undefined && Number.isInteger(safe.bankCode) && Math.abs(safe.bankCode) <= 2147483647 ? safe.bankCode : null,
  };
}
async function atStage<T>(stage: BankStage, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof BanecoError) throw new BanecoError(error.code, error.stage ?? stage, error.httpStatus, error.bankCode, error.qrId);
    throw new BanecoError("bank-operation-failed", stage);
  }
}
export function boliviaDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function validBankDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function bankAmount(value: unknown) {
  const raw = String(value);
  if (!/^\d{1,5}(?:\.\d{1,2})?$/.test(raw)) throw new BanecoError("bank-invalid-amount");
  const cents = Math.round(Number(raw) * 100);
  if (cents < 1 || cents > 5000000) throw new BanecoError("bank-invalid-amount");
  return cents / 100; // Business payments: BOB 0.01..50,000; the authoritative total comes from SQL.
}

type BankTransport = (url: URL, method: string, token?: string, body?: unknown) => Promise<unknown>;
// Keep encryption requests out of fetch instrumentation: query parameters
// contain secrets. This transport never logs URLs/body/token and never follows redirects.
export const bankTransport: BankTransport = (url, method, token, body) => new Promise((resolve, reject) => {
  if (!Object.values(banecoEnvironments).some(base => url.href.startsWith(base))) {
    reject(new BanecoError("bank-invalid-host")); return;
  }
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const req = request(url, { method, timeout: 5000, headers: {
    Accept: "application/json", ...(encoded ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encoded) } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } }, res => {
    const chunks: Buffer[] = []; let bytes = 0;
    res.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 3_000_000) { req.destroy(); reject(new BanecoError("bank-response-too-large")); return; }
      chunks.push(chunk);
    });
    res.on("error", () => reject(new BanecoError("bank-unavailable")));
    res.on("end", () => {
      if (res.statusCode !== 200) { reject(new BanecoError("bank-http-error", undefined, res.statusCode)); return; }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      try { resolve(JSON.parse(text)); } catch { resolve(text); }
    });
  });
  req.on("timeout", () => { req.destroy(); reject(new BanecoError("bank-timeout")); });
  // Socket timeout alone permits an indefinitely slow/trickling response.
  const deadline = setTimeout(() => { req.destroy(); reject(new BanecoError("bank-timeout")); }, 5000);
  req.on("close", () => clearTimeout(deadline));
  req.on("error", () => reject(new BanecoError("bank-unavailable")));
  req.end(encoded);
});

function success(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BanecoError("bank-invalid-response");
  const row = value as Record<string, unknown>;
  if (row.responseCode !== 0) throw new BanecoError("bank-rejected", undefined, 200, typeof row.responseCode === "number" ? row.responseCode : undefined);
  return row;
}
function base64(value: unknown) {
  if (typeof value !== "string" || value.length > 2_700_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new BanecoError("bank-invalid-response");
  return value;
}
export function qrImageDataUrl(value: unknown) {
  const encoded = base64(value);
  const image = Buffer.from(encoded, "base64");
  const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = image[0] === 255 && image[1] === 216 && image[2] === 255;
  if (!png && !jpg) throw new BanecoError("bank-invalid-qr-image");
  return `data:image/${png ? "png" : "jpeg"};base64,${encoded}`;
}

export function createBanecoClient(environment: BanecoEnvironment, credentials: BankCredentials, transport: BankTransport = bankTransport) {
  if (!Object.hasOwn(banecoEnvironments, environment)) throw new BanecoError("bank-invalid-host");
  const url = (path: string) => new URL(path, banecoEnvironments[environment]);
  async function encrypt(value: string) {
    if (credentials.encryptionMode === "pre_encrypted") return base64(value);
    const endpoint = url("api/authentication/encrypt");
    endpoint.searchParams.set("text", value);
    endpoint.searchParams.set("aesKey", credentials.aesKey);
    return base64(await transport(endpoint, "GET"));
  }
  async function authenticate() {
    const password = await atStage("password-encryption", () => encrypt(credentials.password));
    return atStage("authentication", async () => {
      const result = success(await transport(url("api/authentication/authenticate"), "POST", undefined, { userName: credentials.userName, password }));
      if (typeof result.token !== "string" || !result.token || result.token.length > 16000) throw new BanecoError("bank-invalid-response");
      return result.token;
    });
  }
  return {
    async checkConnection() { await authenticate(); return true; },
    async generate(input: { transactionId: string; amount: number; currency: "BOB" | "USD"; dueDate: string; description: string; branchCode: string }) {
      bankAmount(input.amount);
      const token = await authenticate();
      const accountCredit = await atStage("account-encryption", () => encrypt(credentials.accountCredit));
      return atStage("generation", async () => {
        const result = success(await transport(url("api/qrsimple/generateQR"), "POST", token, {
          ...input, accountCredit, singleUse: true, modifyAmount: false,
        }));
        if (typeof result.qrId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(result.qrId)) throw new BanecoError("bank-invalid-response");
        try { return { qrId: result.qrId, image: qrImageDataUrl(result.qrImage) }; }
        catch (error) { throw new BanecoError(error instanceof BanecoError ? error.code : "bank-invalid-qr-image", "generation", 200, 0, result.qrId); }
      });
    },
    async status(qrId: string) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(qrId)) throw new BanecoError("bank-invalid-qr-id");
      const token = await authenticate();
      return atStage("status", async () => success(await transport(url(`api/qrsimple/v2/statusQR/${encodeURIComponent(qrId)}`), "GET", token)));
    },
    async cancel(qrId: string) {
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(qrId)) throw new BanecoError("bank-invalid-qr-id");
      const token = await authenticate();
      await atStage("cancellation", async () => success(await transport(url("api/qrsimple/cancelQR"), "DELETE", token, { qrId })));
    },
  };
}

export function verifyBankStatus(response: Record<string, unknown>, expected: { qrId: string; amount: number; currency: string; branchCode: string; dueDate: string }): "pending" | "paid" | "cancelled" | "review" | "expired" {
  // The specification's table and JSON example use different casing.
  const status = response.statusQrCode ?? response.statusQRCode;
  if (status === 9) return "cancelled";
  if (status === 0) return expected.dueDate < boliviaDate() ? "expired" : "pending";
  if (status !== 1) return "review";
  const payments = Array.isArray(response.payment) ? response.payment : response.payment && typeof response.payment === "object" ? [response.payment] : [];
  if (payments.length !== 1) return "review";
  if (!payments[0] || typeof payments[0] !== "object" || Array.isArray(payments[0])) return "review";
  const payment = payments[0] as Record<string, unknown>;
  const rawAmount = String(payment.amount ?? "");
  if (payment.qrId !== expected.qrId || payment.currency !== expected.currency ||
    !/^\d+(?:\.\d{1,2})?$/.test(rawAmount) || Math.round(Number(rawAmount) * 100) !== Math.round(expected.amount * 100) ||
    (expected.branchCode && payment.branchCode !== expected.branchCode) ||
    typeof payment.transactionId !== "string" || !payment.transactionId.trim() ||
    typeof payment.paymentDate !== "string" || !validBankDate(payment.paymentDate.slice(0, 10)) ||
    typeof payment.paymentTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(payment.paymentTime)) return "review";
  // PaymentQR.transactionId is described as BANK transaction ID, unlike the
  // generation transactionId. Bind by qrId, amount, currency and branch instead.
  return "paid";
}
