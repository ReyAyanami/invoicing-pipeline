import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';

@Injectable()
export class AnalyticsService {
    private readonly logger = new Logger(AnalyticsService.name);

    constructor(
        @InjectRepository(Invoice)
        private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(InvoiceLineItem)
        private readonly lineItemRepository: Repository<InvoiceLineItem>,
    ) { }

    /**
     * Get monthly revenue breakdown for the last 12 months
     */
    async getMonthlyRevenue() {
        return this.invoiceRepository
            .createQueryBuilder('invoice')
            .select("TO_CHAR(invoice.billingPeriodStart, 'YYYY-MM')", 'month')
            .addSelect('SUM(invoice.total)', 'totalRevenue')
            .addSelect('SUM(invoice.subtotal)', 'subtotalRevenue')
            .addSelect('SUM(invoice.tax)', 'totalTax')
            .where("invoice.status IN ('issued', 'paid')")
            .groupBy('month')
            .orderBy('month', 'ASC')
            .getRawMany();
    }

    /**
     * Get revenue distribution by metric type
     */
    async getRevenueByMetric() {
        return this.lineItemRepository
            .createQueryBuilder('lineItem')
            .select('lineItem.metricType', 'metricType')
            .addSelect('SUM(lineItem.amount)', 'revenue')
            .addSelect('SUM(CAST(lineItem.quantity AS DECIMAL))', 'totalQuantity')
            .groupBy('lineItem.metricType')
            .orderBy('revenue', 'DESC')
            .getRawMany();
    }

    /**
     * Get top 10 customers by revenue
     */
    async getTopCustomers() {
        return this.invoiceRepository
            .createQueryBuilder('invoice')
            .select('invoice.customerId', 'customerId')
            .addSelect('SUM(invoice.total)', 'totalRevenue')
            .where("invoice.status IN ('issued', 'paid')")
            .groupBy('invoice.customerId')
            .orderBy('totalRevenue', 'DESC')
            .limit(10)
            .getRawMany();
    }
}
