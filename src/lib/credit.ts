export interface PlatformCredit {
  schoolId: string;
  initialAmount: number;
  initialPaid: boolean;
  initialPaidAt?: string;
  balance: number;
  chargeId?: string;
  chargeStatus: string;
  history: {
    id: string;
    kind: "funding" | "license";
    chargeId: string;
    createdAt: string;
    amount: number;
    balance: number;
  }[];
}
