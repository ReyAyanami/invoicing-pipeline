import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { InvoiceAdjustment } from './entities/invoice-adjustment.entity';
import { RatedCharge } from '../rating/entities/rated-charge.entity';
import { RatingService } from '../rating/rating.service';
import { CustomersService } from '../customers/customers.service';
import { CustomerCredit } from '../customers/entities/customer-credit.entity';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import { Money, Quantity } from '../common/types';
import { LessThanOrEqual, IsNull } from 'typeorm';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(InvoiceLineItem)
    private readonly lineItemRepository: Repository<InvoiceLineItem>,
    @InjectRepository(InvoiceAdjustment)
    private readonly adjustmentRepository: Repository<InvoiceAdjustment>,
    @InjectRepository(CustomerCredit)
    private readonly creditRepository: Repository<CustomerCredit>,
    private readonly ratingService: RatingService,
    private readonly customersService: CustomersService,
  ) { }

  /**
   * Generate an invoice for a customer and period
   */
  async generateInvoice(
    generateInvoiceDto: GenerateInvoiceDto,
  ): Promise<Invoice> {
    const { customerId, periodStart, periodEnd } = generateInvoiceDto;

    // Verify customer exists
    await this.customersService.findOne(customerId);

    // Check for existing issued invoice for same period to determine if this is a correction
    const existingInvoices = await this.invoiceRepository.find({
      where: {
        customerId,
        billingPeriodStart: new Date(periodStart),
        billingPeriodEnd: new Date(periodEnd),
      },
      order: { issuedAt: 'DESC', createdAt: 'DESC' },
    });

    const issuedInvoice = existingInvoices.find(
      (inv) => inv.status === 'issued' || inv.status === 'paid',
    );

    let charges: RatedCharge[];
    let isCorrection = false;
    let referenceInvoiceId: string | null = null;

    if (issuedInvoice) {
      isCorrection = true;
      referenceInvoiceId = issuedInvoice.invoiceId;
      // Fetch only charges calculated AFTER the issued invoice
      const allCharges = await this.ratingService.findChargesForPeriod(
        customerId,
        new Date(periodStart),
        new Date(periodEnd),
      );
      // Filter out charges already included in previous invoices (POC simplified logic)
      charges = allCharges.filter(
        (c) => c.calculatedAt > issuedInvoice.issuedAt!,
      );

      if (charges.length === 0) {
        this.logger.log(`No new charges found for correction period ${periodStart} - ${periodEnd}`);
        return issuedInvoice;
      }
    } else {
      // Fetch all rated charges for the period
      charges = await this.ratingService.findChargesForPeriod(
        customerId,
        new Date(periodStart),
        new Date(periodEnd),
      );
    }

    if (charges.length === 0) {
      this.logger.warn(`No charges found for customer ${customerId} in period ${periodStart} to ${periodEnd}`);
    }

    // Group charges by metric type
    const chargesByMetric = this.groupChargesByMetric(charges);

    // Get customer preference for billing currency
    const customer = await this.customersService.findOne(customerId);
    const currency = generateInvoiceDto.currency ?? customer.billingCurrency ?? 'USD';
    const exchangeRate = this.getExchangeRate(currency);

    // Calculate totals using Money utilities
    let subtotal = Money.sum(charges.map((c) => c.subtotal));
    if (exchangeRate !== '1.00') {
      subtotal = Money.multiply(subtotal, exchangeRate);
    }

    // Apply regional tax
    const taxRate = this.getTaxRate(customer);
    const tax = Money.multiply(subtotal, taxRate);

    // Initial total before credits
    const totalBeforeCredits = Money.add(subtotal, tax);

    // Apply available credits
    const { total, creditsApplied, adjustments } = await this.applyCredits(
      customerId,
      totalBeforeCredits,
    );

    // Create invoice
    const invoice = this.invoiceRepository.create({
      invoiceNumber: isCorrection ? `CORR-${Date.now()}` : `INV-${Date.now()}`,
      invoiceType: isCorrection ? 'correction' : 'standard',
      referenceInvoiceId,
      correctionReason: isCorrection ? 'Back-filled usage from late events' : null,
      customerId,
      billingPeriodStart: new Date(periodStart),
      billingPeriodEnd: new Date(periodEnd),
      currency,
      subtotal,
      tax,
      creditsApplied,
      total,
      status: 'draft',
      issuedAt: null,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);

    // Save adjustments and link to invoice
    for (const adjustment of adjustments) {
      adjustment.invoiceId = savedInvoice.invoiceId;
      await this.adjustmentRepository.save(adjustment);
    }

    // Create line items
    await this.createLineItems(
      savedInvoice.invoiceId,
      chargesByMetric,
      exchangeRate,
    );

    this.logger.log(`Generated ${invoice.invoiceType} invoice ${savedInvoice.invoiceId} for customer ${customerId}: $${total}`);

    return this.findOne(savedInvoice.invoiceId);
  }

  private groupChargesByMetric(charges: RatedCharge[]): Map<string, RatedCharge[]> {
    const grouped = new Map<string, RatedCharge[]>();
    for (const charge of charges) {
      const key = charge.rule?.metricType ?? 'unknown';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(charge);
    }
    return grouped;
  }

  private async createLineItems(
    invoiceId: string,
    chargesByMetric: Map<string, RatedCharge[]>,
    exchangeRate: string = '1.00',
  ): Promise<InvoiceLineItem[]> {
    const lineItems: InvoiceLineItem[] = [];
    let lineNumber = 1;

    for (const [metricType, charges] of chargesByMetric.entries()) {
      const quantity = Quantity.add(...charges.map((c) => c.quantity));
      let amount = Money.sum(charges.map((c) => c.subtotal));

      if (exchangeRate !== '1.00') {
        amount = Money.multiply(amount, exchangeRate);
      }

      const unitPrice = Money.greaterThan(quantity, '0')
        ? Money.divide(amount, quantity)
        : Money.zero();

      const lineItem = this.lineItemRepository.create({
        invoiceId,
        lineNumber: lineNumber++,
        description: `${this.formatMetricName(metricType)} usage`,
        metricType,
        quantity,
        unit: charges[0]?.rule?.unit ?? 'units',
        unitPrice,
        amount,
        chargeIds: charges.map((c) => c.chargeId),
      });

      lineItems.push(await this.lineItemRepository.save(lineItem));
    }
    return lineItems;
  }

  async findAllForCustomer(customerId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { invoiceId: id },
      relations: ['lineItems'],
    });
    if (!invoice) throw new NotFoundException(`Invoice with ID ${id} not found`);
    return invoice;
  }

  async issueInvoice(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'issued') throw new Error('Invoice already issued');
    invoice.status = 'issued';
    invoice.issuedAt = new Date();
    return this.invoiceRepository.save(invoice);
  }

  async exportToCsv(id: string): Promise<string> {
    const invoice = await this.findOne(id);
    const customer = await this.customersService.findOne(invoice.customerId);

    const headers = ['Line #', 'Description', 'Metric', 'Quantity', 'Unit', 'Unit Price', 'Amount'];
    const rows = invoice.lineItems.map((item) => [
      item.lineNumber,
      item.description,
      item.metricType,
      item.quantity,
      item.unit,
      item.unitPrice,
      item.amount,
    ]);

    const taxRate = this.getTaxRate(customer);
    const taxPercentage = (parseFloat(taxRate) * 100).toFixed(0);

    return [
      `Invoice Number,${invoice.invoiceNumber}`,
      `Type,${invoice.invoiceType}`,
      `Customer ID,${invoice.customerId}`,
      `Period,${invoice.billingPeriodStart.toISOString()} to ${invoice.billingPeriodEnd.toISOString()}`,
      `Status,${invoice.status}`,
      `Currency,${invoice.currency}`,
      '',
      headers.join(','),
      ...rows.map((row) => row.join(',')),
      '',
      `Subtotal,,,,,$,${invoice.subtotal}`,
      `Tax (${taxPercentage}%),,,,,$,${invoice.tax}`,
      `Credits Applied,,,,,$,${invoice.creditsApplied}`,
      `Total,,,,,$,${invoice.total}`,
    ].join('\n');
  }

  private formatMetricName(metricType: string): string {
    return metricType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private getTaxRate(customer: any): string {
    const region = (customer.metadata?.taxRegion as string) ?? 'US-STANDARD';
    const rates: Record<string, string> = {
      'US-STANDARD': '0.05',
      'EU-DE': '0.19',
      'EU-FR': '0.20',
      'UK-VAT': '0.20',
      'NO-TAX': '0.00',
    };
    return rates[region] ?? '0.05';
  }

  private async applyCredits(
    customerId: string,
    totalBeforeCredits: Money,
  ): Promise<{ total: Money; creditsApplied: Money; adjustments: InvoiceAdjustment[] }> {
    const activeCredits = await this.creditRepository.find({
      where: [
        { customerId, status: 'active', expiresAt: IsNull() },
        { customerId, status: 'active', expiresAt: LessThanOrEqual(new Date()) }, // POC simplification
      ],
      order: { expiresAt: 'ASC', createdAt: 'ASC' },
    });

    const validCredits = activeCredits.filter(
      (c) => c.expiresAt === null || c.expiresAt >= new Date(),
    );

    let remainingTotal = totalBeforeCredits;
    let totalCreditsApplied = Money.zero();
    const adjustments: InvoiceAdjustment[] = [];

    for (const credit of validCredits) {
      if (Money.compare(remainingTotal, Money.zero()) <= 0) break;
      const creditToApply = Money.compare(credit.remainingAmount, remainingTotal) >= 0
        ? remainingTotal
        : credit.remainingAmount;

      if (Money.compare(creditToApply, Money.zero()) > 0) {
        totalCreditsApplied = Money.add(totalCreditsApplied, creditToApply);
        remainingTotal = Money.subtract(remainingTotal, creditToApply);
        credit.remainingAmount = Money.subtract(credit.remainingAmount, creditToApply);
        if (Money.compare(credit.remainingAmount, Money.zero()) === 0) credit.status = 'fully_used';
        await this.creditRepository.save(credit);

        adjustments.push(this.adjustmentRepository.create({
          creditId: credit.creditId,
          amount: creditToApply,
          type: 'credit_application',
          reason: `Applied from credit ${credit.creditId}`,
        }));
      }
    }

    return { total: remainingTotal, creditsApplied: totalCreditsApplied, adjustments };
  }

  private getExchangeRate(currency: string): string {
    const rates: Record<string, string> = {
      USD: '1.00', EUR: '0.92', GBP: '0.78', JPY: '150.00', BRL: '5.00',
    };
    return rates[currency] ?? '1.00';
  }
}
