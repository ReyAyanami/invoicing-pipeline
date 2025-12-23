import { Controller, Get, Logger } from '@nestjs/common';
import { AnalyticsService } from '../invoices/analytics.service';

@Controller('analytics')
export class AnalyticsController {
    private readonly logger = new Logger(AnalyticsController.name);

    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('revenue/monthly')
    async getMonthlyRevenue() {
        return this.analyticsService.getMonthlyRevenue();
    }

    @Get('revenue/by-metric')
    async getRevenueByMetric() {
        return this.analyticsService.getRevenueByMetric();
    }

    @Get('customers/top')
    async getTopCustomers() {
        return this.analyticsService.getTopCustomers();
    }
}
