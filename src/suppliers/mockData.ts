import type { SupplierHotel } from '../types';

// Overlapping names between A and B (Holtin, Radison, Taj Palace, Ibis Aerocity)
// so the comparison logic has something meaningful to do.
export const SUPPLIER_A: SupplierHotel[] = [
  { hotelId: 'a1', name: 'Holtin', price: 6000, city: 'delhi', commissionPct: 10 },
  { hotelId: 'a2', name: 'Radison', price: 5900, city: 'delhi', commissionPct: 13 },
  { hotelId: 'a3', name: 'Taj Palace', price: 14000, city: 'delhi', commissionPct: 12 },
  { hotelId: 'a4', name: 'The Leela', price: 12500, city: 'delhi', commissionPct: 15 },
  { hotelId: 'a5', name: 'Ibis Aerocity', price: 4200, city: 'delhi', commissionPct: 9 },
  { hotelId: 'a6', name: 'Lemon Tree', price: 5100, city: 'delhi', commissionPct: 11 },
  { hotelId: 'a7', name: 'Trident', price: 11000, city: 'mumbai', commissionPct: 14 },
  { hotelId: 'a8', name: 'Taj Palace', price: 15500, city: 'mumbai', commissionPct: 12 },
];

export const SUPPLIER_B: SupplierHotel[] = [
  { hotelId: 'b1', name: 'Holtin', price: 5340, city: 'delhi', commissionPct: 20 },
  { hotelId: 'b2', name: 'Radison', price: 6100, city: 'delhi', commissionPct: 11 },
  { hotelId: 'b3', name: 'Taj Palace', price: 13200, city: 'delhi', commissionPct: 14 },
  { hotelId: 'b4', name: 'Oberoi', price: 16000, city: 'delhi', commissionPct: 16 },
  { hotelId: 'b5', name: 'Ibis Aerocity', price: 4500, city: 'delhi', commissionPct: 8 },
  { hotelId: 'b6', name: 'Hyatt Regency', price: 9800, city: 'delhi', commissionPct: 13 },
  { hotelId: 'b7', name: 'Trident', price: 10400, city: 'mumbai', commissionPct: 17 },
  { hotelId: 'b8', name: 'Sea Princess', price: 7200, city: 'mumbai', commissionPct: 10 },
];
