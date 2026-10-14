import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { ImportsService, LocationImportRow } from './imports.service';
import * as XLSX from 'xlsx';

import { Roles } from '../../core/guards/roles.decorator';

@ApiTags('Bulk Excel & CSV Ingestion')
@Roles('SUPER_ADMIN', 'ORG_ADMIN')
@Controller('api/v1/imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  private extractTenantId(tenantHeader?: string): string {
    return tenantHeader || 'default-tenant-skilglobal';
  }

  @Get('template/locations')
  @ApiOperation({ summary: 'Download pre-formatted Excel template for Location Bulk Ingestion' })
  downloadLocationTemplate(@Res() res: Response) {
    const buffer = this.importsService.generateLocationTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Locations_Master_Template.xlsx');
    res.send(buffer);
  }

  @Post('locations/dry-run')
  @ApiOperation({ summary: 'Upload spreadsheet and perform non-destructive dry-run validation with line-by-line error checks' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async validateDryRun(
    @Headers('x-tenant-id') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('jsonData') jsonDataString?: string,
  ) {
    let rows: LocationImportRow[] = [];

    if (file) {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const firstSheet = workbook.SheetNames[0];
      const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

      rows = rawRows.map((r) => ({
        areaCode: r.AreaCode || r.areacode || r.area_code || '',
        name: r.Name || r.name || r.AreaName || '',
        locationType: r.LocationType || r.locationtype || r.type || 'PRODUCTION_LINE',
        orgNodeCode: r.OrgNodeCode || r.orgnodecode || r.department_code || '',
        riskLevel: r.RiskLevel || r.risklevel || 'LOW',
        auditFrequency: r.AuditFrequency || r.auditfrequency || 'WEEKLY',
        building: r.Building || r.building || '',
        floor: r.Floor || r.floor || '',
        description: r.Description || r.description || '',
        ownerEmail: r.OwnerEmail || r.owneremail || '',
      }));
    } else if (jsonDataString) {
      try {
        rows = JSON.parse(jsonDataString);
      } catch (e) {
        throw new BadRequestException('Invalid JSON payload');
      }
    } else {
      throw new BadRequestException('Please provide an Excel file or JSON payload');
    }

    return this.importsService.validateLocationsDryRun(this.extractTenantId(tenantId), rows);
  }

  @Post('locations/commit')
  @ApiOperation({ summary: 'Atomically commit validated batch of locations' })
  async commitBatch(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() payload: { rows: LocationImportRow[] },
  ) {
    if (!payload.rows || !Array.isArray(payload.rows) || payload.rows.length === 0) {
      throw new BadRequestException('Rows array cannot be empty');
    }
    return this.importsService.commitLocationsBatch(this.extractTenantId(tenantId), payload.rows, userId);
  }
}
