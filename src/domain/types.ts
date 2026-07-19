export type ReturningDataStatus = "known" | "sampled" | "unknown";
export type Capacity = "yes" | "sometimes" | "no";

export interface RevenueInputs {
  averageMonthlyRevenue: number;
  targetMonthlyRevenue: number;
  averageOrderValue: number;
  operatingDays: number;
  monthlyCustomerCount: number | null;
}

export interface RevenueMetrics {
  shortfallRevenue: number;
  maxNewCustomers: number;
  maxNewCustomersPerDay: number;
  monthlyCustomerCount: number;
  customerCountSource: "actual" | "estimated";
  targetReached: boolean;
}

export interface FieldError {
  field: keyof RevenueInputs | string;
  message: string;
}
