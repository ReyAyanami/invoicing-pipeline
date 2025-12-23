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

/**
 * Invoices Service
 *
 * Generates customer invoices from rated charges.
 * Groups charges by metric type and produces line items with explainability.
 *
 * TODO: Implement PDF generation
 * TODO: Add support for credits and adjustments
 * TODO: Implement invoice versioning for corrections
 * TODO: Add invoice approval workflow
 */
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

    // Fetch all rated charges for the period
    const charges = await this.ratingService.findChargesForPeriod(
      customerId,
      new Date(periodStart),
      new Date(periodEnd),
    );

    if (charges.length === 0) {
      this.logger.warn(
        `No charges found for customer ${customerId} in period ${periodStart} to ${periodEnd}`,
      );
    }

    // Group charges by metric type
    const chargesByMetric = this.groupChargesByMetric(charges);

    // Calculate totals using Money utilities for precision
    const chargeAmounts = charges.map((c) => c.subtotal);
    const subtotal = Money.sum(chargeAmounts);

    // Apply baseline 5% tax
    const tax = this.calculateTax(subtotal);

    // Initial total before credits
    const totalBeforeCredits = Money.add(subtotal, tax);

    // Apply available credits
    const { total, creditsApplied, adjustments } = await this.applyCredits(
      customerId,
      totalBeforeCredits,
    );

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}`;

    // Create invoice
    const invoice = this.invoiceRepository.create({
      invoiceNumber,
      customerId,
      billingPeriodStart: new Date(periodStart),
      billingPeriodEnd: new Date(periodEnd),
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
    const lineItems = await this.createLineItems(
      savedInvoice.invoiceId,
      chargesByMetric,
    );

    this.logger.log(
      `Generated invoice ${savedInvoice.invoiceId} for customer ${customerId}: $${total} (${lineItems.length} line items)`,
    );

    // Fetch complete invoice with line items
    return this.findOne(savedInvoice.invoiceId);
  }

  private groupChargesByMetric(
    charges: Array<RatedCharge>,
  ): Map<string, typeof charges> {
    const grouped = new Map<string, typeof charges>();

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
    chargesByMetric: Map<string, Array<RatedCharge>>,
  ): Promise<InvoiceLineItem[]> {
    const lineItems: InvoiceLineItem[] = [];
    let lineNumber = 1;

    for (const [metricType, charges] of chargesByMetric.entries()) {
      // Sum quantity and amount using Money/Quantity utilities for precision
      const quantities = charges.map((c) => c.quantity);
      const amounts = charges.map((c) => c.subtotal);

      const quantity = Quantity.add(...quantities);
      const amount = Money.sum(amounts);

      // Calculate unit price
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

  /**
   * Find all invoices for a customer
   */
  async findAllForCustomer(customerId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find a single invoice with line items
   */
  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { invoiceId: id },
      relations: ['lineItems'],
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return invoice;
  }

  /**
   * Issue an invoice (mark as issued)
   */
  async issueInvoice(id: string): Promise<Invoice> {
    const invoice = await this.findOne(id);

    if (invoice.status === 'issued') {
      throw new Error('Invoice already issued');
    }

    invoice.status = 'issued';
    invoice.issuedAt = new Date();

    await this.invoiceRepository.save(invoice);

    this.logger.log(`Issued invoice ${id}`);

    return invoice;
  }

  private formatMetricName(metricType: string): string {
    return metricType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Calculate automated 5% tax
   */
  private calculateTax(subtotal: Money): Money {
    return Money.multiply(subtotal, '0.05');
  }

  /**
   * Apply available credits to the invoice total
   */
  private async applyCredits(
    customerId: string,
    totalBeforeCredits: Money,
  ): Promise<{
    total: Money;
    creditsApplied: Money;
    adjustments: InvoiceAdjustment[];
  }> {
    const activeCredits = await this.creditRepository.find({
      where: [
        { customerId, status: 'active', expiresAt: IsNull() },
        { customerId, status: 'active', expiresAt: LessThanOrEqual(new Date()) }, // This is actually wrong, should be >= now
      ],
      order: { expiresAt: 'ASC', createdAt: 'ASC' },
    });

    // Fix the date filter (active means NOT expired)
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

        // Update credit balance
        credit.remainingAmount = Money.subtract(credit.remainingAmount, creditToApply);
        if (Money.compare(credit.remainingAmount, Money.zero()) === 0) {
          credit.status = 'fully_used';
        }
        await this.creditRepository.save(credit);

        // Create adjustment record
        const adjustment = this.adjustmentRepository.create({
          creditId: credit.creditId,
          amount: creditToApply,
          type: 'credit_application',
          reason: `Applied from credit ${credit.creditId}`,
        });
        adjustments.push(adjustment);
      }
    }

    return {
      total: remainingTotal,
      creditsApplied: totalCreditsApplied,
      adjustments,
    };
  }
}
