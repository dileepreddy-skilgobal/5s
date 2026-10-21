import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { RoleGroups } from '../../core/guards/role-groups';
import { TenantId, CurrentUserId } from '../../core/auth/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { Response } from 'express';
import { BulkImportService } from './bulk-import.service';

import { Roles } from '../../core/guards/roles.decorator';

/** Maximum spreadsheet upload size (5 MB). */
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

@ApiTags('Bulk Excel & CSV Ingestion')
@ApiBearerAuth()
@Roles(...RoleGroups.ORG_ADMINS)
@Controller('api/v1/imports')
export class ImportsController {
  constructor(private readonly bulk: BulkImportService) {}

  @Get('catalogue')
  @ApiOperation({ summary: 'Available imports with their columns' })
  catalogue() {
    return this.bulk.catalogue();
  }

  @Get('template/:kind')
  @ApiOperation({ summary: 'Download the Excel template (with an instructions sheet) for org-nodes | locations | users | questions | standards | actions' })
  downloadTemplate(@Param('kind') kind: string, @Res() res: Response) {
    const buffer = this.bulk.template(kind);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${kind}-import-template.xlsx`);
    res.send(buffer);
  }

  @Post(':kind/dry-run')
  @ApiOperation({ summary: 'Validate a spreadsheet (or JSON rows) without writing anything' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
      fileFilter: (_req, file, callback) => {
        const allowed = /\.(xlsx|xls|csv)$/i.test(file.originalname);
        callback(allowed ? null : new BadRequestException('Only .xlsx, .xls or .csv spreadsheets can be imported'), allowed);
      },
    }),
  )
  async dryRun(
    @TenantId() tenantId: string,
    @CurrentUserId() userId: string,
    @Param('kind') kind: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body('rows') rows?: unknown,
  ) {
    const parsed = file ? this.bulk.parse(kind, file.buffer) : rows;
    if (!parsed) throw new BadRequestException('Upload a spreadsheet or send rows');
    return this.bulk.dryRun(kind, tenantId, userId, parsed);
  }

  @Post(':kind/commit')
  @ApiOperation({ summary: 'Import validated rows atomically (all or nothing)' })
  commit(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Param('kind') kind: string, @Body('rows') rows: unknown) {
    return this.bulk.commit(kind, tenantId, userId, rows);
  }
}
