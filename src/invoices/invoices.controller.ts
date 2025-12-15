import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';

@Controller('api/v1/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  generateInvoice(@Body() generateInvoiceDto: GenerateInvoiceDto) {
    return this.invoicesService.generateInvoice(generateInvoiceDto);
  }

  @Get()
  findAll(@Query('customerId') customerId?: string) {
    if (customerId) {
      return this.invoicesService.findAllForCustomer(customerId);
    }
    // TODO: Implement pagination for all invoices
    throw new Error('Must provide customerId query parameter');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Patch(':id/issue')
  issueInvoice(@Param('id') id: string) {
    return this.invoicesService.issueInvoice(id);
  }
}
