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

export interface GoalAllocationInput {
  newCustomerRevenue: number | null;
  returningCustomerRevenue: number | null;
  averageOrderValueRevenue: number | null;
}

export interface GoalAllocation {
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
  averageOrderValueRevenue: number;
}

export interface AdvertisingInputs {
  visitConversionRate: number | null;
  costPerClick: number | null;
  actualAdNewCustomers: number | null;
  actualAdSpend: number | null;
}

export interface AdvertisingMetrics {
  status: "measured" | "needs_measurement";
  newCustomerTarget: number;
  requiredClicks: number | null;
  estimatedAdSpend: number | null;
  customerAcquisitionCost: number | null;
}

export interface FieldError {
  field: keyof RevenueInputs | string;
  message: string;
}

export type BottleneckKey =
  "exposure" | "click" | "visit" | "averageOrderValue" | "returning";

export interface ComparableMetric {
  previous: number | null;
  current: number | null;
}

export interface BottleneckInputs {
  exposure: ComparableMetric;
  click: ComparableMetric;
  visit: ComparableMetric;
  averageOrderValue: ComparableMetric;
  returning: ComparableMetric;
  returningDataStatus: ReturningDataStatus;
}

export interface BottleneckResult {
  key: BottleneckKey | null;
  status: "known" | "stable" | "insufficient";
  changeRate: number | null;
  reason: string;
}

export type PrimaryConcern =
  "customers" | "ads" | "averageOrderValue" | "returning" | "unknown";

export interface RecommendationContext {
  metrics: RevenueMetrics;
  bottleneck: BottleneckResult;
  primaryConcern: PrimaryConcern;
  capacity: Capacity;
  returningDataStatus: ReturningDataStatus;
  hasConsentDb: boolean;
  canChangeMenu: boolean;
  adsRunning: boolean;
  adAttributionKnown: boolean;
}

export interface RecommendedAction {
  key:
    | "profit-review"
    | "average-order-value"
    | "measure-acquisition-source"
    | "returning-message"
    | "off-peak-offer"
    | "local-discovery";
  title: string;
  reason: string;
  steps: readonly [string, string, string];
  metric: string;
  avoid: string;
  minutes: number;
  coachingKey: string;
}
