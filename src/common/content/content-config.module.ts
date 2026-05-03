import { Global, Module } from '@nestjs/common';
import { ContentLinksService } from './content-links.service';

@Global()
@Module({
  providers: [ContentLinksService],
  exports: [ContentLinksService],
})
export class ContentConfigModule {}
