import { Global, Module } from '@nestjs/common';
import { AppNamespaceService } from './app-namespace.service';

@Global()
@Module({
  providers: [AppNamespaceService],
  exports: [AppNamespaceService],
})
export class AppNamespaceModule {}
