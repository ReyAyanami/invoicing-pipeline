import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from '../invoices/analytics.service';
import { AnalyticsController } from './analytics.controller';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceLineItem } from '../invoices/entities/invoice-line-item.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Invoice, InvoiceLineItem])],
    controllers: [AnalyticsController],
    providers: [AnalyticsService],
})
export class AnalyticsModule { }
