import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { FEATURES, PLATFORM_CURRENCY } from '../../../core/subscription/plans';

export class CreatePlanDto {
  @ApiProperty({ example: 'GROWTH' })
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, { message: 'code must be 2–30 upper-case letters, digits or underscores' })
  code: string;

  @ApiProperty() @IsString() @MinLength(2) @MaxLength(60) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiProperty({ description: 'Monthly price in Indian rupees' }) @IsNumber() @Min(0) @Max(100000000) priceMonthly: number;
  @ApiPropertyOptional({ enum: [PLATFORM_CURRENCY], description: 'Prices are always in Indian rupees' }) @IsOptional() @IsIn([PLATFORM_CURRENCY], { message: 'currency must be INR: all plans are priced in Indian rupees' }) currency?: string;

  @ApiPropertyOptional({ nullable: true, description: 'null = unlimited' })
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000000)
  maxUsers: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = unlimited' })
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000000)
  maxLocations: number | null;

  @ApiProperty() @IsInt() @Min(100) @Max(10000000) storageQuotaMb: number;

  @ApiProperty({ enum: FEATURES, isArray: true })
  @IsArray() @ArrayUnique() @IsIn([...FEATURES], { each: true })
  features: string[];

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional({ description: 'Monthly price in Indian rupees' }) @IsOptional() @IsNumber() @Min(0) @Max(100000000) priceMonthly?: number;
  @ApiPropertyOptional({ enum: [PLATFORM_CURRENCY] }) @IsOptional() @IsIn([PLATFORM_CURRENCY], { message: 'currency must be INR: all plans are priced in Indian rupees' }) currency?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000000) maxUsers?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000000) maxLocations?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(10000000) storageQuotaMb?: number;
  @ApiPropertyOptional({ enum: FEATURES, isArray: true }) @IsOptional() @IsArray() @ArrayUnique() @IsIn([...FEATURES], { each: true }) features?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

/** Super-admin maintenance of a tenant's subscription (there is no payment gateway). */
export class UpdateTenantSubscriptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() planCode?: string;
  @ApiPropertyOptional({ enum: ['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'] }) @IsOptional() @IsIn(['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED']) status?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString() trialEndsAt?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Paid-through date' }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsDateString() currentPeriodEnd?: string | null;
  @ApiPropertyOptional({ description: 'Overrides the plan quota' }) @IsOptional() @IsInt() @Min(100) @Max(10000000) storageQuotaMb?: number;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_o, v) => v !== null) @IsEmail() billingEmail?: string | null;
}
