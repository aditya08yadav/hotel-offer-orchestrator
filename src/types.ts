export type SupplierId = 'A' | 'B';

/** Shape returned by the mock supplier APIs. */
export interface SupplierHotel {
  hotelId: string;
  name: string;
  price: number;
  city: string;
  commissionPct: number;
}

/** Shape returned to API clients and stored in Redis. */
export interface HotelOffer {
  name: string;
  price: number;
  supplier: string; // "Supplier A" | "Supplier B"
  commissionPct: number;
}

export interface WorkflowInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface WorkflowResult {
  hotels: HotelOffer[];
  /** Suppliers that failed after retries (partial results are still returned). */
  degradedSuppliers: string[];
}
