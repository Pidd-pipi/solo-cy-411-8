import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ActivityCategory } from '../constants/activity';
import { FactorStatus } from '../constants/factor';
import { RequireAuth } from '../middlewares/auth';
import { RoleGuard, Roles } from '../middlewares/roleCheck';
import { FactorAmendInput, FactorPublishInput, FactorService } from '../services/factorService';
import { logTemplate } from '../utils/logger';

@Controller('factors')
@UseGuards(RequireAuth, RoleGuard)
export class FactorController {
  constructor(private readonly factorService: FactorService) {}

  // 因子版本列表：默认返回全部版本（含停用），供管理端展示版本/生效期/状态。
  @Get()
  list(
    @Query('category') category?: ActivityCategory,
    @Query('region') region?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    const includeFlag = includeInactive === undefined ? true : includeInactive !== 'false';
    return this.factorService.list(category, region, includeFlag);
  }

  // 发布新版本（可指定未来生效日期）。
  @Post()
  @Roles('admin')
  async publish(@Req() request: Request, @Body() body: FactorPublishInput) {
    request.auditEntity = 'CarbonFactor';
    request.auditAction = 'CarbonFactor publish version';
    logTemplate('info', 'FACTOR_PUBLISH_START', { region: body.region, category: body.category, subType: body.subType, effectiveDate: body.effectiveDate });
    try {
      return await this.factorService.publish(body);
    } catch (error: any) {
      logTemplate('error', 'FACTOR_PUBLISH_FAILED', { region: body.region, category: body.category, subType: body.subType, field: 'CarbonFactor.effective_date', reason: error.message });
      throw error;
    }
  }

  // 修正尚未生效的版本（因子值/单位/生效日期）。
  @Patch(':id')
  @Roles('admin')
  async amend(@Req() request: Request, @Param('id') id: string, @Body() body: FactorAmendInput) {
    request.auditEntity = 'CarbonFactor';
    request.auditEntityId = Number(id);
    request.auditAction = 'CarbonFactor amend version';
    try {
      return await this.factorService.amend(Number(id), body);
    } catch (error: any) {
      logTemplate('error', 'FACTOR_AMEND_FAILED', { id, field: 'CarbonFactor.version', reason: error.message });
      throw error;
    }
  }

  // 停用 / 重新启用版本（不影响已固化活动）。
  @Patch(':id/status')
  @Roles('admin')
  async setStatus(@Req() request: Request, @Param('id') id: string, @Body() body: { status: FactorStatus }) {
    request.auditEntity = 'CarbonFactor';
    request.auditEntityId = Number(id);
    request.auditAction = 'CarbonFactor change status';
    return this.factorService.setStatus(Number(id), body.status);
  }
}
