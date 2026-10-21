import { Global, Module } from '@nestjs/common';
import { FilesService } from './files.service';

/** File storage (disk / S3) shared by every module. */
@Global()
@Module({
  providers: [FilesService],
  exports: [FilesService],
})
export class StorageModule {}
