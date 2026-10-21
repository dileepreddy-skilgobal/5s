import { apiClient } from './api';
import type { RedTag, RedTagMetrics } from '../types';

/** Units accepted by the server (UNITS_OF_MEASURE). */
export const RED_TAG_UNITS = ['PCS', 'KG', 'BOXES', 'PALLETS', 'SETS'] as const;
export type RedTagUnit = (typeof RED_TAG_UNITS)[number];
export const RED_TAG_UNIT_LABELS: Record<RedTagUnit, string> = {
  PCS: 'Pieces',
  KG: 'Kilograms',
  BOXES: 'Boxes',
  PALLETS: 'Pallets',
  SETS: 'Sets',
};

export interface CreateRedTagInput {
  locationId: string;
  targetHoldingAreaId?: string;
  itemName: string;
  itemDescription?: string;
  category: string;
  quantity: number;
  unitOfMeasure: RedTagUnit;
  estimatedValue?: number;
  reason: string;
  /** Data URL of a photo taken or uploaded on the device; the server stores it as a file. */
  photoUrl?: string;
  /** YYYY-MM-DD; the server defaults to 14 days after tagging. */
  targetDispositionDate?: string;
}

export interface CloseRedTagInput {
  /** Required by the server when the item is disposed of (not kept in service). */
  closurePhotoUrl?: string;
  financialRecovered?: number;
}

export const redTagApi = {
  list: async (): Promise<RedTag[]> => {
    const res = await apiClient.get('/red-tags');
    return res.data;
  },
  metrics: async (): Promise<RedTagMetrics> => {
    const res = await apiClient.get('/red-tags/metrics');
    return res.data;
  },
  /** Detail view; its QR code always encodes the link to this tag. */
  get: async (id: string): Promise<RedTag> => {
    const res = await apiClient.get(`/red-tags/${id}`);
    return res.data;
  },
  create: async (data: CreateRedTagInput): Promise<RedTag> => {
    const res = await apiClient.post('/red-tags', data);
    return res.data;
  },
  /** Allowed while the tag is still open (tagged, in holding area or awaiting a decision). */
  cancel: async (id: string): Promise<RedTag> => {
    const res = await apiClient.patch(`/red-tags/${id}`, { status: 'CANCELLED' });
    return res.data;
  },
  submitDisposition: async (id: string, data: { dispositionAction: string; dispositionJustification: string; supervisorApproved: boolean }): Promise<RedTag> => {
    const res = await apiClient.post(`/red-tags/${id}/disposition`, data);
    return res.data;
  },
  close: async (id: string, data: CloseRedTagInput): Promise<RedTag> => {
    const res = await apiClient.post(`/red-tags/${id}/close`, data);
    return res.data;
  },
};
