import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ActivityCategory } from '../constants/activity';
import { RequireAuth } from '../middlewares/auth';
import { RoleGuard, Roles } from '../middlewares/roleCheck';
import { FactorInput, FactorService } from '../services/factorService';
import { logTemplate } from '../utils/logger';

@Controller('factors')
@UseGuards(RequireAuth, RoleGuard)
export class FactorController {
  constructor(private readonly factorService: FactorService) {}

  @Get()
  list(@Query('category') category?: ActivityCategory, @Query('region') region?: string) {
    return this.factorService.list(category, region);
  }

  @Post()
  @Roles('admin')
  async create(@Req() request: Request, @Body() body: FactorInput) {
    request.auditEntity = 'CarbonFactor';
    request.auditAction = 'CarbonFactor create';
    logTemplate('info', 'FACTOR_LIST_START');
    return this.factorService.create(body);
  }
}
