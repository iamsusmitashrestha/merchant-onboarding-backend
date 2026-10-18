import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { MerchantApplication } from './entities/merchant-application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantApplication]),
    AuditModule,
    UsersModule,
  ],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
})
export class ApplicationsModule {}
