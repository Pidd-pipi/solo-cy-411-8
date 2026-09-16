import { Column, Entity, Index, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { FactorStatus } from '../constants/factor';
import { Activity } from './activity';

@Entity('carbon_factors')
// 同一地区、分类、子类型在任一日期只能有一个版本：
// effective_date 唯一即把时间轴切成互不重叠的左闭右开生效区间，
// 也作为并发发布时数据库层面的兜底（重复键 => 只有一次成功）。
@Index('uk_factor_version', ['region', 'category', 'subType', 'effectiveDate'], { unique: true })
@Index('uk_factor_version_no', ['region', 'category', 'subType', 'version'], { unique: true })
@Index('idx_factor_match', ['region', 'category', 'subType', 'status', 'effectiveDate'])
export class CarbonFactor {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'enum', enum: ActivityCategory })
  category!: ActivityCategory;

  @Column({ name: 'sub_type', length: 64 })
  subType!: string;

  @Column({ name: 'factor_value', type: 'decimal', precision: 12, scale: 4 })
  factorValue!: string;

  @Column({ length: 32 })
  unit!: string;

  @Column({ length: 64 })
  region!: string;

  // 版本号：同一 region+category+sub_type 内单调递增
  @Column({ type: 'int' })
  version!: number;

  // 生效起始日期（含），区间直到下一版本的 effective_date
  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate!: string;

  @Column({ type: 'enum', enum: FactorStatus })
  status!: FactorStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @OneToMany(() => Activity, (activity) => activity.factor)
  activities!: Activity[];
}
