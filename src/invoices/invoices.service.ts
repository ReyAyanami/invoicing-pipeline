import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Invoice } from './entities/invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { RatedCharge } from '../rating/entities/rated-charge.entity';
import { RatingService } from '../rating/rating.service';
import { CustomersService } from '../customers/customers.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

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
    private readonly ratingService: RatingService,
    private readonly customersService: CustomersService,
  ) {}

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

    // Calculate totals using Decimal for precision
    const subtotal = charges.reduce(
      (sum, charge) => sum.plus(new Decimal(charge.subtotal)),
      new Decimal(0),
    );
    const tax = new Decimal(0); // TODO: Implement tax calculation
    const total = subtotal.plus(tax);

    // Generate invoice number
    const invoiceNumber = `INV-${Date.now()}`;

    // Create invoice
    const invoice = this.invoiceRepository.create({
      invoiceNumber,
      customerId,
      billingPeriodStart: new Date(periodStart),
      billingPeriodEnd: new Date(periodEnd),
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      total: total.toFixed(2),
      status: 'draft',
      issuedAt: null,
    });

    const savedInvoice = await this.invoiceRepository.save(invoice);

    // Create line items
    const lineItems = await this.createLineItems(
      savedInvoice.invoiceId,
      chargesByMetric,
    );

    this.logger.log(
      `Generated invoice ${savedInvoice.invoiceId} for customer ${customerId}: $${total.toFixed(2)} (${lineItems.length} line items)`,
    );

    // Fetch complete invoice with line items
    return this.findOne(savedInvoice.invoiceId);
  }

  private groupChargesByMetric(
    charges: Array<RatedCharge>,
  ): Map<string, typeof charges> {
    const grouped = new Map<string, typeof charges>();

    for (const charge of charges) {
      // RatedCharge doesn't have metricType directly, would need to join with aggregation
      // For now, use a placeholder
      const key = 'usage';
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
      // Sum quantity and amount using Decimal for precision
      const quantity = charges.reduce(
        (sum, charge) => sum.plus(new Decimal(charge.quantity)),
        new Decimal(0),
      );
      const amount = charges.reduce(
        (sum, charge) => sum.plus(new Decimal(charge.subtotal)),
        new Decimal(0),
      );

      // Calculate unit price with Decimal
      const unitPrice = quantity.greaterThan(0)
        ? amount.dividedBy(quantity)
        : new Decimal(0);

      const lineItem = this.lineItemRepository.create({
        invoiceId,
        lineNumber: lineNumber++,
        description: `${metricType} usage`,
        metricType,
        quantity: quantity.toFixed(6),
        unit: 'units',
        unitPrice: unitPrice.toFixed(6),
        amount: amount.toFixed(2),
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
}
