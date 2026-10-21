import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../core/auth/public.decorator';
import { CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { FilesService } from '../../core/storage/files.service';
import { MAX_BYTES } from '../../core/storage/file-types';

const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp|heic)|application\/pdf|audio\/|video\/)/;

@ApiTags('Files & Evidence')
@Controller('api/v1/files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an evidence file (image, PDF, audio, video). Put the returned `url` in the record; the server stores it in canonical form.' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: Math.max(...Object.values(MAX_BYTES)) } }))
  async upload(@TenantId() tenantId: string, @CurrentUserId() userId: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Send the file in a multipart field named "file".');
    return this.files.store({ tenantId, uploadedById: userId, buffer: file.buffer, originalName: file.originalname, source: 'upload' });
  }

  @Get('usage')
  @ApiBearerAuth()
  @Roles(...RoleGroups.PROGRAM_MANAGERS)
  @ApiOperation({ summary: 'Storage used by this organization against its quota' })
  usage(@TenantId() tenantId: string) {
    return this.files.usage(tenantId);
  }

  @Post('migrate-inline')
  @ApiBearerAuth()
  @Roles(...RoleGroups.ORG_ADMINS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move base64 media stored inside records into file storage (idempotent)' })
  migrate(@TenantId() tenantId: string) {
    return this.files.migrateInline(tenantId);
  }

  /** Signed, time-limited download. Links are produced by the API in every response that references a file. */
  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Download a file via a signed URL (?t=&exp=&sig=[&v=thumb])' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: { t?: string; exp?: string; sig?: string; v?: string; download?: string },
    @Res() res: Response,
  ) {
    const file = await this.files.readSigned(id, q);
    const inline = q.download !== '1' && INLINE_TYPES.test(file.contentType);
    const name = (file.fileName ?? `${id}`).replace(/[^\w.-]+/g, '_');
    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.body.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
      'Cache-Control': `private, max-age=${file.maxAge}`,
      'X-Content-Type-Options': 'nosniff',
      // Served files never run script, even if a browser mis-detects them
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      ...(file.sha256 ? { 'X-Content-SHA256': file.sha256 } : {}),
    });
    res.send(file.body);
  }
}
