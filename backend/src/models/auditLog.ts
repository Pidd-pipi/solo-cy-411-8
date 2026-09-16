import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId!: number | null;

  @Column({ length: 64 })
  action!: string;

  @Column({ length: 64 })
  entity!: string;

  @Column({ name: 'entity_id', type: 'bigint', nullable: true })
  entityId!: number | null;

  @Column({ type: 'text' })
  detail!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
