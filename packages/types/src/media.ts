/** Slot-based media system types. */

export interface MediaSlot {
  owner_type: string;
  owner_id: string;
  slot_name: string;
  media_asset_id: string;
  blurhash?: string;
  width?: number;
  height?: number;
  variants: Record<string, string>; // variant_name -> object_key
  focal_x: number;
  focal_y: number;
  resolved_at: string;
}

export interface SlotAssignRequest {
  media_asset_id: string;
  crop?: {
    x: number;
    y: number;
    w: number;
    h: number;
    focal_x?: number;
    focal_y?: number;
  };
}

export interface BatchSlotRequest {
  queries: { owner_type: string; owner_id: string }[];
}

export interface BatchSlotResponse {
  results: Record<string, MediaSlot[]>; // "ownerType:ownerId" -> slots
}
