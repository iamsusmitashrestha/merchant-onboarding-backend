import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO4217CurrencyCode,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BusinessType } from '../enums/business-type.enum';

export class CreateApplicationDto {
  @ApiProperty({ example: 'Acme Test Shop' })
  @IsString()
  @Length(1, 200)
  businessName: string;

  @ApiProperty({ example: 'Acme Test Shop LLC' })
  @IsString()
  @Length(1, 200)
  legalBusinessName: string;

  @ApiProperty({ enum: BusinessType, example: BusinessType.LLC })
  @IsEnum(BusinessType)
  businessType: BusinessType;

  @ApiProperty({ example: 'Test Owner' })
  @IsString()
  @Length(1, 200)
  ownerName: string;

  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  @MaxLength(320)
  ownerEmail: string;

  @ApiProperty({ example: '+1 555 0100' })
  @Matches(/^\+?[0-9 ()-]{7,20}$/, {
    message: 'ownerPhone must be 7–20 digits, spaces, dashes or parentheses',
  })
  ownerPhone: string;

  @ApiProperty({
    example: '00-0000001',
    description: 'Sensitive: masked in responses',
  })
  @Matches(/^[0-9A-Z-]{4,20}$/, {
    message:
      'taxId must be 4–20 characters of digits, capital letters or dashes',
  })
  taxId: string;

  @ApiProperty({ example: '5734', description: 'Merchant category code' })
  @Matches(/^\d{4}$/, { message: 'mcc must be exactly 4 digits' })
  mcc: string;

  @ApiProperty({ example: 'USD' })
  @IsISO4217CurrencyCode()
  currency: string;

  @ApiProperty({ example: 5_000_000, description: 'Minor units (e.g. cents)' })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedMonthlyVolumeMinor: number;

  @ApiProperty({ example: 2_500, description: 'Minor units (e.g. cents)' })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  averageTicketMinor: number;
}
