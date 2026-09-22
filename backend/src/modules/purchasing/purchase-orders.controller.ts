import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PurchaseOrderCreateDto,
  PurchaseOrderListQuery,
  PurchaseOrderPageResponse,
  PurchaseOrderResponse,
  PurchaseOrderTransitionDto,
  PurchaseOrderUpdateDto,
} from './dto/purchase-order.dto';
import {
  PurchaseApprovalListQuery,
  PurchaseApprovalPageResponse,
  PurchaseApprovalRequestDto,
  PurchaseApprovalResponse,
} from './dto/purchase-approval.dto';
import {
  GoodsReceiptCreateDto,
  GoodsReceiptListQuery,
  GoodsReceiptPageResponse,
  GoodsReceiptResponse,
} from './dto/goods-receipt.dto';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseApprovalsService } from './purchase-approvals.service';
import { GoodsReceiptsService } from './goods-receipts.service';

function validateIdempotencyKey(key?: string): void {
  if (key !== undefined && (key.length < 8 || key.length > 128)) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
      'Invalid Idempotency-Key header length (must be between 8 and 128 characters)',
    );
  }
}

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(
    private readonly poService: PurchaseOrdersService,
    private readonly approvalsService: PurchaseApprovalsService,
    private readonly receiptsService: GoodsReceiptsService,
  ) {}

  // 6. GET /purchase-orders
  @Get()
  @Permissions('purchasing.read')
  list(
    @Query() query: PurchaseOrderListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderPageResponse> {
    return this.poService.list(query, actor);
  }

  // 7. POST /purchase-orders (HTTP 201)
  @Post()
  @Permissions('purchasing.create')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: PurchaseOrderCreateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    return this.poService.create(dto, actor);
  }

  // 8. GET /purchase-orders/:purchaseOrderId
  @Get(':purchaseOrderId')
  @Permissions('purchasing.read')
  getById(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    return this.poService.getById(purchaseOrderId, actor);
  }

  // 9. PATCH /purchase-orders/:purchaseOrderId
  @Patch(':purchaseOrderId')
  @Permissions('purchasing.create')
  update(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Body() dto: PurchaseOrderUpdateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    return this.poService.update(purchaseOrderId, dto, actor);
  }

  // 10. POST /purchase-orders/:purchaseOrderId/transitions (HTTP 200)
  @Post(':purchaseOrderId/transitions')
  @Permissions('purchasing.create')
  @HttpCode(HttpStatus.OK)
  transition(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Body() dto: PurchaseOrderTransitionDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    return this.poService.transition(purchaseOrderId, dto, actor);
  }

  // 11. GET /purchase-orders/:purchaseOrderId/approvals
  @Get(':purchaseOrderId/approvals')
  @Permissions('purchasing.read')
  listApprovals(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Query() query: PurchaseApprovalListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalPageResponse> {
    return this.approvalsService.list(purchaseOrderId, query, actor);
  }

  // 12. POST /purchase-orders/:purchaseOrderId/approvals (HTTP 201)
  @Post(':purchaseOrderId/approvals')
  @Permissions('purchasing.approve')
  @HttpCode(HttpStatus.CREATED)
  decide(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Body() dto: PurchaseApprovalRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalResponse> {
    return this.approvalsService.decide(purchaseOrderId, dto, actor);
  }

  // 13. GET /purchase-orders/:purchaseOrderId/goods-receipts
  @Get(':purchaseOrderId/goods-receipts')
  @Permissions('purchasing.read')
  listGoodsReceipts(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Query() query: GoodsReceiptListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<GoodsReceiptPageResponse> {
    return this.receiptsService.list(purchaseOrderId, query, actor);
  }

  // 14. POST /purchase-orders/:purchaseOrderId/goods-receipts (HTTP 201)
  @Post(':purchaseOrderId/goods-receipts')
  @Permissions('purchasing.receive')
  @HttpCode(HttpStatus.CREATED)
  async createGoodsReceipt(
    @Param('purchaseOrderId', new ParseUUIDPipe()) purchaseOrderId: string,
    @Body() dto: GoodsReceiptCreateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<GoodsReceiptResponse> {
    validateIdempotencyKey(idempotencyKey);
    return this.receiptsService.create(purchaseOrderId, dto, idempotencyKey, actor);
  }
}
