// src/scraper/dto/scraper.dto.ts
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsPositive,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScraperOptionsDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  maxItems?: number;

  @IsOptional()
  @IsBoolean()
  headless?: boolean;
}

export class RunScraperDto {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  tiendaId: number;

  @IsOptional()
  @Type(() => ScraperOptionsDto)
  options?: ScraperOptionsDto;
}

export class ProgramarScraperDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(23)
  @Type(() => Number)
  hora: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(59)
  @Type(() => Number)
  minuto: number;
}
