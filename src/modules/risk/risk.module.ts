import { Module } from '@nestjs/common';
import { RISK_PROVIDER } from './risk-provider';
import { SimulatedKybProvider } from './simulated-kyb.provider';

@Module({
  providers: [{ provide: RISK_PROVIDER, useClass: SimulatedKybProvider }],
  exports: [RISK_PROVIDER],
})
export class RiskModule {}
