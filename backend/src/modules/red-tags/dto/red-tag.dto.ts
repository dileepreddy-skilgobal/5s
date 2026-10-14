import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateRedTagDto {
  @IsString()
  locationId: string;

  @IsOptional()
  @IsString()
  targetHoldingAreaId?: string;

  @IsString()
  itemName: string;

  @IsOptional()
  @IsString()
  itemDescription?: string;

  @IsString()
  category: string; // UNNEEDED_TOOL, SURPLUS_INVENTORY, BROKEN_EQUIPMENT, SCRAP_WASTE, UNLABELLED_MATERIAL, EXPIRED_ITEM, OTHER

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string; // PCS, KG, BOXES, PALLETS, SETS

  @IsOptional()
  @IsNumber()
  estimatedValue?: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  targetDispositionDate?: string;
}

export class UpdateRedTagDto {
  @IsOptional()
  @IsString()
  itemName?: string;

  @IsOptional()
  @IsString()
  itemDescription?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsString()
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber()
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  status?: string; // RED_TAGGED, IN_HOLDING_AREA, PENDING_DISPOSITION, DISPOSITION_APPROVED, DISPOSED, RETURNED, CANCELLED

  @IsOptional()
  @IsString()
  targetHoldingAreaId?: string;

  @IsOptional()
  @IsString()
  targetDispositionDate?: string;
}

export class SubmitDispositionDto {
  @IsString()
  dispositionAction: string; // DISPOSE_SCRAP, RELOCATE, RETURN_TO_VENDOR, AUCTION_SELL, REPAIR_RESTORE, KEEP_JUSTIFIED

  @IsString()
  dispositionJustification: string;

  @IsOptional()
  @IsBoolean()
  supervisorApproved?: boolean;

  @IsOptional()
  @IsString()
  supervisorName?: string;
}

export class CloseRedTagDto {
  @IsOptional()
  @IsString()
  closurePhotoUrl?: string;

  @IsOptional()
  @IsNumber()
  financialRecovered?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
