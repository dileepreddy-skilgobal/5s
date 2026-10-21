import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, IsDateString, Min, IsNotEmpty, MaxLength } from 'class-validator';
import { values } from '../../../core/validation/domain-values';
import { EmptyToUndefined } from '../../../core/validation/transforms';

export class CreateRedTagDto {
  @IsString()
  locationId: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  targetHoldingAreaId?: string;

  @IsString()
  itemName: string;

  @IsOptional()
  @IsString()
  itemDescription?: string;

  @IsString()
  @IsIn(values('RED_TAG_CATEGORIES'))
  category: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @IsIn(values('UNITS_OF_MEASURE'))
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
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
  @IsIn(values('RED_TAG_CATEGORIES'))
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  @IsIn(values('UNITS_OF_MEASURE'))
  unitOfMeasure?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @IsOptional()
  @IsString()
  @IsIn(values('RED_TAG_STATUSES'))
  status?: string;

  @IsOptional()
  @IsString()
  targetHoldingAreaId?: string;

  @EmptyToUndefined()
  @IsOptional()
  @IsDateString()
  targetDispositionDate?: string;
}

export class SubmitDispositionDto {
  @IsString()
  @IsIn(values('DISPOSITION_ACTIONS'))
  dispositionAction: string;

  @IsString()
  dispositionJustification: string;

  @IsOptional()
  @IsBoolean()
  supervisorApproved?: boolean;
}

/** POST /red-tags/:id/move-to-holding — the item was moved to a red-tag holding area. */
export class MoveToHoldingDto {
  @IsString()
  @IsNotEmpty()
  holdingAreaId: string;
}

/** POST /red-tags/:id/disposition/reject — a supervisor rejects the proposed decision; the reason is kept on the tag. */
export class RejectDispositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

export class CloseRedTagDto {
  /**
   * What was actually done with the item, when it differs from the approved decision (e.g. approved for sale,
   * finally scrapped). Decides whether the tag ends as disposed or returned, and whether a photo is required.
   */
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  @IsIn(values('DISPOSITION_ACTIONS'))
  actualDispositionAction?: string;

  /** Required when the disposition disposes of the item (scrap, sale, return to vendor). */
  @EmptyToUndefined()
  @IsOptional()
  @IsString()
  closurePhotoUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  financialRecovered?: number;
}
